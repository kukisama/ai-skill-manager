/**
 * SkillInstaller — 下载 → 校验 → 解压 → 写 lockfile
 *
 * 支持多目标安装：claude (~/.claude/skills)、openclaw (~/.openclaw/workspace/skills) 或 both。
 * Claude 目标会生成 .skill-meta.json 以兼容 VS Code Copilot 发现机制。
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import { SkillhubClient } from "../api/SkillhubClient";
import { LockfileManager, SkillLockMeta } from "./LockfileManager";
import { extractZip } from "../utils/archive";
import { CLAUDE_SKILLS_DIR } from "../config/ConfigResolver";

export class SkillInstaller {
  constructor(
    private client: SkillhubClient,
    private lockfile: LockfileManager,
    private targetDirs: string[]
  ) {}

  /** 配置变化时更新目标 */
  updateTargets(targetDirs: string[]): void {
    this.targetDirs = targetDirs;
  }

  /**
   * 安装一个技能到所有目标目录
   */
  async install(
    slug: string,
    force = false,
    progress?: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<void> {
    // 检查首个目标目录是否已存在
    const primaryDir = path.join(this.targetDirs[0], slug);

    if (fs.existsSync(primaryDir) && !force) {
      const existing = this.lockfile.get(slug);
      if (existing) {
        throw new Error(`Skill "${slug}" 已安装 (v${existing.version})，使用强制模式覆盖`);
      }
    }

    progress?.report({ message: `正在下载 ${slug}...` });
    const zipBuf = await this.client.downloadSkillZip(slug);

    progress?.report({ message: `正在解压 ${slug}...` });

    // 先解压到临时目录
    const tmpDir = path.join(os.tmpdir(), `skillhub-install-${slug}-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      await extractZip(zipBuf, tmpDir);

      // 读取版本信息
      const version = readMetaVersion(tmpDir);

      // 复制到所有目标目录
      for (const targetRoot of this.targetDirs) {
        const targetDir = path.join(targetRoot, slug);

        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        fs.mkdirSync(targetDir, { recursive: true });
        copyDirSync(tmpDir, targetDir);

        // Claude 目标：生成 .skill-meta.json 以兼容 VS Code Copilot 发现
        if (this.isClaudeDir(targetRoot)) {
          writeClaudeSkillMeta(targetDir, slug);
        }
      }

      const meta: SkillLockMeta = {
        name: slug,
        zip_url: this.client["endpoints"].skillsPrimaryDownloadTemplate.replace(
          "{slug}",
          encodeURIComponent(slug)
        ),
        source: "skillhub",
        version,
      };

      this.lockfile.recordInstall(slug, meta);
      progress?.report({ message: `${slug} 安装完成 (v${version})` });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * 卸载一个技能（从所有目标目录移除）
   */
  uninstall(slug: string): void {
    for (const targetRoot of this.targetDirs) {
      const targetDir = path.join(targetRoot, slug);
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    }
    this.lockfile.recordUninstall(slug);
  }

  /** 判断目标目录是否是 Claude skills 目录 */
  private isClaudeDir(dir: string): boolean {
    const a = dir.replace(/\\/g, "/").toLowerCase();
    const b = CLAUDE_SKILLS_DIR.replace(/\\/g, "/").toLowerCase();
    return a === b || a.startsWith(b + "/");
  }
}

// ── 辅助函数 ─────────────────────────────────────────────

/**
 * 生成 .skill-meta.json 兼容 Claude/VS Code Copilot 发现机制
 */
function writeClaudeSkillMeta(skillDir: string, slug: string): void {
  const metaPath = path.join(skillDir, ".skill-meta.json");
  const meta = {
    source: "skillhub",
    sourceUrl: `skillhub://${slug}`,
    installDate: new Date().toISOString(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");
}

function readMetaVersion(skillDir: string): string {
  const metaPath = path.join(skillDir, "_meta.json");
  try {
    const data = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    if (typeof data.version === "string") return data.version.trim();
  } catch {}
  // fallback: 找 config.json
  const configPath = path.join(skillDir, "config.json");
  try {
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (typeof data.version === "string") return data.version.trim();
  } catch {}
  return "";
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
