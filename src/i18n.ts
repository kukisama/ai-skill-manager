/**
 * i18n — 简易国际化模块
 *
 * 支持中文 (zh) 和英文 (en)，默认跟随操作系统语言。
 * 用户可通过 skillhub.language 手动覆盖（auto / zh / en）。
 */

import * as vscode from "vscode";

export type Locale = "zh" | "en";

// ── 字符串表 ────────────────────────────────────────────────

const zh: Record<string, string> = {
  // ── 通用 ──
  "common.skills": "Skill",
  "common.skill": "Skill",
  "common.install": "安装",
  "common.uninstall": "卸载",
  "common.installed": "已安装",
  "common.installing": "安装中...",
  "common.save": "保存",
  "common.cancel": "取消",
  "common.search": "搜索",
  "common.loading": "正在加载...",
  "common.error": "错误",
  "common.version": "版本",
  "common.directory": "目录",
  "common.location": "位置",
  "common.author": "作者",
  "common.download": "下载",

  // ── 数据源 ──
  "source.china.label": "国内源 (SkillHub)",
  "source.china.desc": "由腾讯skillhub提供",
  "source.global.label": "国际源 (ClawHub)",
  "source.global.desc": "开源社区 clawhub.ai，34000+ Skill，全球 CDN",
  "source.switched": "数据源已切换到",
  "source.label": "数据源",

  // ── TreeView 分组 ──
  "group.claude": "Claude / GitHub",
  "group.openclaw": "OpenClaw",
  "group.agent": "Agent",
  "group.project": "项目本地",
  "group.instructions": "指令文件",
  "group.empty": "暂无已安装 Skill",

  // ── TreeView Tooltip 位置名 ──
  "loc.claude": "Claude / GitHub",
  "loc.openclaw": "OpenClaw",
  "loc.agent": "Agent",
  "loc.project": "项目",

  // ── SearchPanel ──
  "search.title": "🔍 发现 Skill",
  "search.placeholder": "搜索 Skill（如 react, testing, deploy）...",
  "search.hint": "选择分类浏览或输入关键词搜索",
  "search.hintSub": "从 Skill 商店发现并安装",
  "search.noResults": "未找到相关 Skill",
  "search.filter": "当前分类",
  "search.downloads": "下载",
  "search.installs": "安装",
  "search.switchSource": "切换数据源",

  // ── SettingsPanel ──
  "settings.title": "⚙ 控制面板",
  "settings.source": "📡 数据源",
  "settings.deploy": "📂 部署位置",
  "settings.advanced": "🔧 高级选项",
  "settings.clickAction": "👆 点击行为",
  "settings.clickPreview": "预览",
  "settings.clickEdit": "编辑",
  "settings.clickActionHint": "点击 Skill 时打开预览还是编辑 SKILL.md 文件",
  "settings.language": "🌐 语言 / Language",
  "settings.langAuto": "跟随系统",
  "settings.langZh": "中文",
  "settings.langEn": "English",
  "settings.endpointOverride": "搜索 API 端点覆盖",
  "settings.endpointHint": "手动锁定搜索 API 地址（留空使用当前数据源默认地址）",
  "settings.endpointPlaceholder": "例如: https://lightmake.site/api/v1/search",
  "settings.dirNotExist": "目录不存在",
  "settings.skillsCount": "个 Skill",
  "settings.skillsDetected": "个 Skill 检测到",
  "settings.currentProject": "当前项目",
  "settings.local": "本地",

  // ── 部署目标名 ──
  "target.claude": "VS Code Copilot (Claude / GitHub)",
  "target.openclaw": "OpenClaw",
  "target.agent": "VS Code Agent",

  // ── 通知 / 提示 ──
  "msg.installDone": "已安装",
  "msg.uninstallDone": "已卸载",
  "msg.uninstallConfirm": "确定要卸载 Skill",
  "msg.uninstallBtn": "卸载",
  "msg.inputSlug": "输入 Skill slug",
  "msg.inputSlugHint": "例如: my-skill",
  "msg.checkUpdate": "检查 Skill 更新",
  "msg.checking": "正在检查",
  "msg.noUpgradable": "所有 Skill 已是最新版本",
  "msg.noVersionInfo": "没有可检查的 Skill（无版本信息）",
  "msg.upgradable": "个可升级 Skill",
  "msg.upgradeAll": "全部升级",
  "msg.upgrading": "升级",
  "msg.upgradeFail": "升级失败",
  "msg.upgradeDone": "升级完成",
  "msg.moved": "已移动",
  "msg.skillsTo": "个 Skill 到",
  "msg.targetExists": "目标目录已存在",
  "msg.moveFail": "移动失败",
  "msg.noSkillMd": "该 Skill 没有 SKILL.md 文件",
  "msg.dirNotExist": "目录不存在",
  "msg.viewDetail": "查看详情",
  "msg.sourceSwitched": "数据源已切换到",
  "msg.sourceChinaFull": "国内源 (SkillHub)",
  "msg.sourceGlobalFull": "国际源 (ClawHub)",
  "msg.symlink": "符号链接 → 实际目录",
  "msg.symlinkDeleteConfirm": "这是一个符号链接，仅会移除链接本身，不会删除实际目录。确定要删除",
  "msg.deleteOriginalWarn": "⚠ 此目录有其他位置的符号链接指向它，删除后链接将失效！确定要删除",
  "msg.deleteLink": "删除链接",
  "msg.deleteOriginal": "仍然删除",
};

const en: Record<string, string> = {
  // ── 通用 ──
  "common.skills": "Skills",
  "common.skill": "Skill",
  "common.install": "Install",
  "common.uninstall": "Uninstall",
  "common.installed": "Installed",
  "common.installing": "Installing...",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.search": "Search",
  "common.loading": "Loading...",
  "common.error": "Error",
  "common.version": "Version",
  "common.directory": "Directory",
  "common.location": "Location",
  "common.author": "Author",
  "common.download": "Download",

  // ── 数据源 ──
  "source.china.label": "China Source (SkillHub)",
  "source.china.desc": "Powered by Tencent Skillhub",
  "source.global.label": "Global Source (ClawHub)",
  "source.global.desc": "Open-source community clawhub.ai, 34000+ skills, global CDN",
  "source.switched": "Source switched to",
  "source.label": "Source",

  // ── TreeView 分组 ──
  "group.claude": "Claude / GitHub",
  "group.openclaw": "OpenClaw",
  "group.agent": "Agent",
  "group.project": "Project Local",
  "group.instructions": "Instruction Files",
  "group.empty": "No installed skills",

  // ── TreeView Tooltip 位置名 ──
  "loc.claude": "Claude / GitHub",
  "loc.openclaw": "OpenClaw",
  "loc.agent": "Agent",
  "loc.project": "Project",

  // ── SearchPanel ──
  "search.title": "🔍 Discover Skills",
  "search.placeholder": "Search skills (e.g. react, testing, deploy)...",
  "search.hint": "Browse by category or search by keyword",
  "search.hintSub": "Discover and install skills from the store",
  "search.noResults": "No matching skills found",
  "search.filter": "Current category",
  "search.downloads": "downloads",
  "search.installs": "installs",
  "search.switchSource": "Switch Source",

  // ── SettingsPanel ──
  "settings.title": "⚙ Control Panel",
  "settings.source": "📡 Source",
  "settings.deploy": "📂 Deploy Targets",
  "settings.advanced": "🔧 Advanced",
  "settings.clickAction": "👆 Click Action",
  "settings.clickPreview": "Preview",
  "settings.clickEdit": "Edit",
  "settings.clickActionHint": "Open preview or edit SKILL.md file when clicking a skill",
  "settings.language": "🌐 Language / 语言",
  "settings.langAuto": "System Default",
  "settings.langZh": "中文",
  "settings.langEn": "English",
  "settings.endpointOverride": "Search API Endpoint Override",
  "settings.endpointHint": "Manually lock the search API URL (leave blank for default)",
  "settings.endpointPlaceholder": "e.g. https://clawhub.ai/api/v1/search",
  "settings.dirNotExist": "Directory not found",
  "settings.skillsCount": "skills",
  "settings.skillsDetected": "skills detected",
  "settings.currentProject": "Current Project",
  "settings.local": "Local",

  // ── 部署目标名 ──
  "target.claude": "VS Code Copilot (Claude / GitHub)",
  "target.openclaw": "OpenClaw",
  "target.agent": "VS Code Agent",

  // ── 通知 / 提示 ──
  "msg.installDone": "Installed",
  "msg.uninstallDone": "Uninstalled",
  "msg.uninstallConfirm": "Are you sure you want to uninstall",
  "msg.uninstallBtn": "Uninstall",
  "msg.inputSlug": "Enter skill slug",
  "msg.inputSlugHint": "e.g. my-skill",
  "msg.checkUpdate": "Checking skill updates",
  "msg.checking": "Checking",
  "msg.noUpgradable": "All skills are up to date",
  "msg.noVersionInfo": "No skills with version info to check",
  "msg.upgradable": "upgradable skill(s)",
  "msg.upgradeAll": "Upgrade All",
  "msg.upgrading": "Upgrading",
  "msg.upgradeFail": "Upgrade failed",
  "msg.upgradeDone": "Upgrade complete",
  "msg.moved": "Moved",
  "msg.skillsTo": "skill(s) to",
  "msg.targetExists": "Target directory already exists",
  "msg.moveFail": "Move failed",
  "msg.noSkillMd": "No SKILL.md file for this skill",
  "msg.dirNotExist": "Directory not found",
  "msg.viewDetail": "View Detail",
  "msg.sourceSwitched": "Source switched to",
  "msg.sourceChinaFull": "China Source (SkillHub)",
  "msg.sourceGlobalFull": "Global Source (ClawHub)",
  "msg.symlink": "Symlink → actual directory",
  "msg.symlinkDeleteConfirm": "This is a symlink. Only the link will be removed, not the actual directory. Delete",
  "msg.deleteOriginalWarn": "⚠ Other symlinks point to this directory. Deleting it will break those links! Delete",
  "msg.deleteLink": "Delete Link",
  "msg.deleteOriginal": "Delete Anyway",
};

// ── 字符串表索引 ──────────────────────────────────────────

const tables: Record<Locale, Record<string, string>> = { zh, en };

// ── 语言解析 ──────────────────────────────────────────────

/** 当前生效的语言 */
export function currentLocale(): Locale {
  const cfg = vscode.workspace
    .getConfiguration("skillhub")
    .get<string>("language", "auto")
    .trim()
    .toLowerCase();

  if (cfg === "zh") return "zh";
  if (cfg === "en") return "en";

  // auto — 跟随操作系统
  const vsLang = vscode.env.language; // 如 "zh-cn", "en", "ja"
  return vsLang.startsWith("zh") ? "zh" : "en";
}

/** 取本地化字符串 */
export function t(key: string): string {
  const locale = currentLocale();
  return tables[locale]?.[key] ?? tables["en"]?.[key] ?? key;
}
