/**
 * SkillScanner — 统一扫描所有技能目录
 *
 * 扫描 3 个全局目录 + 当前工作区，按所在目录分组提供给 TreeView。
 * 不区分安装来源（skillhub/github），只看技能实际存在于哪个目录。
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  CLAUDE_SKILLS_DIR,
  OPENCLAW_SKILLS_DIR,
  AGENT_SKILLS_DIR,
  resolveLockfileHome,
} from "../config/ConfigResolver";

// ── 数据模型 ─────────────────────────────────────────────

export interface ScannedSkill {
  slug: string;
  version: string;
  /** 技能实际目录（用于打开 SKILL.md 等） */
  dir: string;
  /** 存在于哪些全局目录（用徽章展示） */
  locations: LocationTag[];
  hasSkillMd: boolean;
  /** 单文件条目（如 AGENTS.md、CLAUDE.md）的完整路径 */
  filePath?: string;
  /** 是否为符号链接 / junction */
  isSymlink?: boolean;
  /** 符号链接指向的实际路径 */
  symlinkTarget?: string;
}

export type LocationTag = "claude" | "openclaw" | "agent" | "project";

export interface GroupedSkills {
  claude: ScannedSkill[];
  openclaw: ScannedSkill[];
  agent: ScannedSkill[];
  project: ScannedSkill[];
  projectGroups: ProjectSkillGroup[];
}

export interface ProjectSkillGroup {
  /** 相对工作区根目录的路径，如 ".agents/skills" */
  relDir: string;
  /** 绝对路径 */
  absDir: string;
  skills: ScannedSkill[];
}

// ── 扫描器 ───────────────────────────────────────────────

export class SkillScanner {
  private cache: GroupedSkills | null = null;

  /** 刷新缓存 */
  refresh(): GroupedSkills {
    this.cache = this.scanAll();
    return this.cache;
  }

  /** 获取分组结果（有缓存用缓存） */
  getGrouped(): GroupedSkills {
    return this.cache ?? this.refresh();
  }

  private scanAll(): GroupedSkills {
    const dirToTag: Array<[string, LocationTag]> = [
      [CLAUDE_SKILLS_DIR, "claude"],
      [OPENCLAW_SKILLS_DIR, "openclaw"],
      [AGENT_SKILLS_DIR, "agent"],
    ];

    // 读 lockfile 仅用于获取版本号
    const lockfileSkills = readLockfile(resolveLockfileHome());

    const grouped: GroupedSkills = { claude: [], openclaw: [], agent: [], project: [], projectGroups: [] };

    // 每个全局目录独立扫描，不去重
    for (const [dir, tag] of dirToTag) {
      if (!fs.existsSync(dir)) continue;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!isDirectoryEntry(entry, dir)) continue;
        if (entry.name.startsWith(".")) continue;

        const slug = entry.name;
        const skillDir = path.join(dir, slug);
        const version = readVersion(slug, skillDir, lockfileSkills);
        const hasSkillMd = fs.existsSync(path.join(skillDir, "SKILL.md"));
        const linkInfo = detectSymlink(skillDir);

        grouped[tag].push({ slug, version, dir: skillDir, locations: [tag], hasSkillMd, ...linkInfo });
      }
    }

    // 扫描当前工作区
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    for (const wf of workspaceFolders) {
      this.scanWorkspaceFolder(wf.uri.fsPath, grouped);
    }

    for (const arr of [grouped.claude, grouped.openclaw, grouped.agent, grouped.project]) {
      arr.sort((a, b) => a.slug.localeCompare(b.slug));
    }

    return grouped;
  }

  /**
   * 扫描工作区文件夹，查找所有技能目录并按层级分组
   */
  private scanWorkspaceFolder(
    root: string,
    grouped: GroupedSkills
  ): void {
    const projectGroups = grouped.projectGroups;

    // 直接检查: {root}/SKILL.md → 工作区本身就是一个 skill
    if (fs.existsSync(path.join(root, "SKILL.md"))) {
      const slug = path.basename(root);
      grouped.project.push({ slug, version: "", dir: root, locations: ["project"], hasSkillMd: true });
    }

    const skipDirs = new Set(["node_modules", ".git", "bin", "obj", "out", "dist", "build", "__pycache__"]);

    // 收集所有候选技能父目录
    const candidates: Array<{ absDir: string; relDir: string }> = [];

    // 直接子目录模式: skills, .skills, skill
    for (const name of ["skills", ".skills", "skill"]) {
      const dir = path.join(root, name);
      try {
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
          candidates.push({ absDir: dir, relDir: name });
        }
      } catch { /* */ }
    }

    // 扫描根级目录，查找含 skills 子目录的（如 .agents/skills, .claude/skills, .github/skills）
    try {
      const rootEntries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of rootEntries) {
        if (!entry.isDirectory()) continue;
        if (skipDirs.has(entry.name)) continue;

        const skillsSubDir = path.join(root, entry.name, "skills");
        try {
          if (fs.existsSync(skillsSubDir) && fs.statSync(skillsSubDir).isDirectory()) {
            const relDir = `${entry.name}/skills`;
            if (!candidates.some(c => c.absDir === skillsSubDir)) {
              candidates.push({ absDir: skillsSubDir, relDir });
            }
          }
        } catch { /* */ }
      }
    } catch { /* */ }

    // 扫描知名指令文件（AGENTS.md、CLAUDE.md 等）
    const wellKnownFiles: Array<{ name: string; paths: string[] }> = [
      {
        name: "AGENTS.md",
        paths: [
          path.join(root, "AGENTS.md"),
          path.join(root, ".github", "AGENTS.md"),
        ],
      },
      {
        name: "CLAUDE.md",
        paths: [
          path.join(root, "CLAUDE.md"),
          path.join(root, ".claude", "CLAUDE.md"),
        ],
      },
    ];

    const standaloneFiles: ScannedSkill[] = [];
    for (const wk of wellKnownFiles) {
      for (const fp of wk.paths) {
        try {
          if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
            const relFile = path.relative(root, fp).replace(/\\/g, "/");
            standaloneFiles.push({
              slug: wk.name,
              version: "",
              dir: path.dirname(fp),
              locations: ["project"],
              hasSkillMd: false,
              filePath: fp,
            });
            break; // 同名文件只取第一个找到的
          }
        } catch { /* */ }
      }
    }

    if (standaloneFiles.length > 0) {
      // 在最前面的子分组中显示，或创建独立分组
      const instrRelDir = "📋 Instructions";
      projectGroups.push({
        relDir: instrRelDir,
        absDir: root,
        skills: standaloneFiles,
      });
    }

    // 扫描每个候选目录
    for (const { absDir, relDir } of candidates) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(absDir, { withFileTypes: true });
      } catch { continue; }

      const groupSkills: ScannedSkill[] = [];

      for (const entry of entries) {
        if (!isDirectoryEntry(entry, absDir)) continue;
        if (entry.name.startsWith(".")) continue;

        const skillDir = path.join(absDir, entry.name);
        const slug = entry.name;
        const hasSkillMd = fs.existsSync(path.join(skillDir, "SKILL.md"));

        const skill: ScannedSkill = {
          slug, version: "", dir: skillDir, locations: ["project"], hasSkillMd,
        };
        groupSkills.push(skill);
        grouped.project.push(skill);
      }

      if (groupSkills.length > 0) {
        groupSkills.sort((a, b) => a.slug.localeCompare(b.slug));
        projectGroups.push({ relDir, absDir, skills: groupSkills });
      }
    }
  }
}

// ── 辅助函数 ─────────────────────────────────────────────

/** entry.isDirectory() 对 junction/symlink 返回 false，需额外判断 */
function isDirectoryEntry(entry: fs.Dirent, parentDir: string): boolean {
  if (entry.isDirectory()) return true;
  if (entry.isSymbolicLink()) {
    try {
      return fs.statSync(path.join(parentDir, entry.name)).isDirectory();
    } catch { return false; }
  }
  return false;
}

/** 检测目录是否为符号链接/junction，返回链接信息 */
function detectSymlink(dirPath: string): { isSymlink?: boolean; symlinkTarget?: string } {
  try {
    const lstat = fs.lstatSync(dirPath);
    if (lstat.isSymbolicLink()) {
      const target = fs.realpathSync(dirPath);
      return { isSymlink: true, symlinkTarget: target };
    }
  } catch { /* */ }
  return {};
}

function readVersion(
  slug: string,
  skillDir: string,
  lockfileSkills: Map<string, { version: string }>
): string {
  // lockfile 优先
  const lockMeta = lockfileSkills.get(slug);
  if (lockMeta?.version) return lockMeta.version;

  // _meta.json
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(skillDir, "_meta.json"), "utf-8")
    );
    if (typeof data.version === "string") return data.version.trim();
  } catch { /* */ }

  // config.json
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(skillDir, "config.json"), "utf-8")
    );
    if (typeof data.version === "string") return data.version.trim();
  } catch { /* */ }

  return "";
}

/**
 * 读取 lockfile (~/.skillhub/.skills_store_lock.json) — 仅用于获取版本号
 */
function readLockfile(
  lockfileHome: string
): Map<string, { version: string }> {
  const map = new Map<string, { version: string }>();
  const lockPath = path.join(lockfileHome, ".skills_store_lock.json");
  try {
    const data = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    if (typeof data.skills === "object" && data.skills !== null) {
      for (const [slug, meta] of Object.entries(data.skills)) {
        const m = meta as Record<string, unknown>;
        map.set(slug, {
          version: typeof m.version === "string" ? m.version : "",
        });
      }
    }
  } catch { /* */ }
  return map;
}
