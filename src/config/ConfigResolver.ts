/**
 * ConfigResolver — 双数据源端点配置
 *
 * 国内源 (SkillHub) 和国际源 (ClawHub) 二选一，由设置 skillhub.source 控制。
 * 所有端点硬编码，不再需要下载 CLI 数据包。
 */

import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import { t } from "../i18n";

// ── 数据源类型 ──────────────────────────────────────────────
export type SourceType = "china" | "global";

// ── 国内源端点（SkillHub） ──────────────────────────────────
const CHINA_ENDPOINTS: Endpoints = {
  skillsSearchUrl: "https://lightmake.site/api/v1/search",
  skillsPrimaryDownloadTemplate: "https://lightmake.site/api/v1/download?slug={slug}",
  skillsDownloadTemplate: "https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills/{slug}.zip",
};

// ── 国际源端点（ClawHub） ───────────────────────────────────
const GLOBAL_ENDPOINTS: Endpoints = {
  skillsSearchUrl: "https://clawhub.ai/api/v1/search",
  skillsPrimaryDownloadTemplate: "https://clawhub.ai/api/v1/download?slug={slug}",
  skillsDownloadTemplate: "https://clawhub.ai/api/v1/download?slug={slug}",
};

const LOCKFILE_HOME_DEFAULT = path.join(os.homedir(), ".skillhub");

/** VS Code Copilot (Claude) 识别的 skill 目录 */
export const CLAUDE_SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");
/** VS Code Agent 识别的 skill 目录 */
export const AGENT_SKILLS_DIR = path.join(os.homedir(), ".agents", "skills");
/** OpenClaw 技能目录 */
export const OPENCLAW_SKILLS_DIR = path.join(
  os.homedir(),
  ".openclaw",
  "workspace",
  "skills"
);

/** 3 个部署位置的开关状态 */
export interface DeployTargets {
  claude: boolean;
  openclaw: boolean;
  agent: boolean;
}

export interface Endpoints {
  /** 搜索 API */
  skillsSearchUrl: string;
  /** 主下载地址模板 {slug} */
  skillsPrimaryDownloadTemplate: string;
  /** 备用下载地址模板 {slug} */
  skillsDownloadTemplate: string;
}

export interface ResolvedConfig {
  /** lockfile 存放目录 */
  lockfileHome: string;
  /** 部署目标开关 */
  targets: DeployTargets;
  /** 当前数据源 */
  source: SourceType;
  endpoints: Endpoints;
}

/** 数据源描述信息（i18n） */
export function getSourceInfo(): Record<SourceType, { label: string; description: string; url: string }> {
  return {
    china: {
      label: t("source.china.label"),
      description: t("source.china.desc"),
      url: "https://lightmake.site",
    },
    global: {
      label: t("source.global.label"),
      description: t("source.global.desc"),
      url: "https://clawhub.ai",
    },
  };
}

/** @deprecated 使用 getSourceInfo() 代替——保留兼容 */
export const SOURCE_INFO: Record<SourceType, { label: string; description: string; url: string }> = {
  china: {
    label: "国内源 (SkillHub)",
    description: "由腾讯skillhub提供",
    url: "https://lightmake.site",
  },
  global: {
    label: "国际源 (ClawHub)",
    description: "开源社区 clawhub.ai，34000+ Skill，全球 CDN",
    url: "https://clawhub.ai",
  },
};

export function resolveLockfileHome(): string {
  return LOCKFILE_HOME_DEFAULT;
}

export function resolveDeployTargets(): DeployTargets {
  const cfg = vscode.workspace.getConfiguration("skillhub");
  return {
    claude: cfg.get<boolean>("targetClaude", true),
    openclaw: cfg.get<boolean>("targetOpenclaw", false),
    agent: cfg.get<boolean>("targetAgent", false),
  };
}

export function resolveSource(): SourceType {
  const raw = vscode.workspace
    .getConfiguration("skillhub")
    .get<string>("source", "china")
    .trim()
    .toLowerCase();
  return raw === "global" ? "global" : "china";
}

/**
 * 从 DeployTargets 构建实际目录列表。至少保证一个（claude 兜底）
 */
export function buildTargetDirs(targets: DeployTargets): string[] {
  const dirs: string[] = [];
  if (targets.claude) dirs.push(CLAUDE_SKILLS_DIR);
  if (targets.openclaw) dirs.push(OPENCLAW_SKILLS_DIR);
  if (targets.agent) dirs.push(AGENT_SKILLS_DIR);
  // 至少一个
  if (dirs.length === 0) dirs.push(CLAUDE_SKILLS_DIR);
  return dirs;
}

/**
 * 解析全部配置。根据 source 设置返回对应端点。
 */
export function resolve(): ResolvedConfig {
  const lockfileHome = resolveLockfileHome();
  const source = resolveSource();

  const baseEndpoints = source === "global" ? { ...GLOBAL_ENDPOINTS } : { ...CHINA_ENDPOINTS };

  const targets = resolveDeployTargets();

  return { lockfileHome, targets, source, endpoints: baseEndpoints };
}
