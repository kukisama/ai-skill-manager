/**
 * LockfileManager — 读写 .skills_store_lock.json
 *
 * 格式与 CLI 完全兼容：{ version: 1, skills: { [slug]: SkillLockMeta } }
 * lockfile 存放在 cliHome（~/.skillhub），与技能安装目录分离。
 */

import * as fs from "fs";
import * as path from "path";

export interface SkillLockMeta {
  name: string;
  zip_url: string;
  source: string;
  version: string;
}

export interface Lockfile {
  version: number;
  skills: Record<string, SkillLockMeta>;
}

const LOCKFILE_NAME = ".skills_store_lock.json";

export class LockfileManager {
  private lockfilePath: string;

  /**
   * @param lockfileDir lockfile 存放目录（通常是 cliHome，如 ~/.skillhub）
   * @param primarySkillDir 主技能安装目录（用于 skillDir() 和 SKILL.md 查找）
   */
  constructor(
    private lockfileDir: string,
    private primarySkillDir: string
  ) {
    this.lockfilePath = path.join(lockfileDir, LOCKFILE_NAME);
  }

  /** 配置变化时更新路径 */
  updatePaths(lockfileDir: string, primarySkillDir: string): void {
    this.lockfileDir = lockfileDir;
    this.primarySkillDir = primarySkillDir;
    this.lockfilePath = path.join(lockfileDir, LOCKFILE_NAME);
  }

  /** 读取 lockfile */
  load(): Lockfile {
    try {
      const raw = fs.readFileSync(this.lockfilePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof parsed.skills === "object"
      ) {
        return {
          version: typeof parsed.version === "number" ? parsed.version : 1,
          skills: parsed.skills ?? {},
        };
      }
    } catch {
      // 文件不存在或无效
    }
    return { version: 1, skills: {} };
  }

  /** 保存 lockfile */
  save(lock: Lockfile): void {
    fs.mkdirSync(this.lockfileDir, { recursive: true });
    fs.writeFileSync(
      this.lockfilePath,
      JSON.stringify(lock, null, 2) + "\n",
      "utf-8"
    );
  }

  /** 获取所有已安装技能 */
  listInstalled(): Array<{ slug: string } & SkillLockMeta> {
    const lock = this.load();
    return Object.entries(lock.skills)
      .map(([slug, meta]) => ({ slug, ...meta }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }

  /** 记录一个安装 */
  recordInstall(slug: string, meta: SkillLockMeta): void {
    const lock = this.load();
    lock.skills[slug] = meta;
    this.save(lock);
  }

  /** 移除一个记录 */
  recordUninstall(slug: string): void {
    const lock = this.load();
    delete lock.skills[slug];
    this.save(lock);
  }

  /** 查询单个技能 */
  get(slug: string): SkillLockMeta | undefined {
    const lock = this.load();
    return lock.skills[slug];
  }

  /** 获取主目录下的技能路径（用于 SKILL.md 查找等） */
  skillDir(slug: string): string {
    return path.join(this.primarySkillDir, slug);
  }
}
