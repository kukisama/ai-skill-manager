/**
 * InstalledSkillsProvider — 按目录分组的已安装技能 TreeView
 *
 * 一级: 目录分组 (Claude / OpenClaw / Agent / 项目本地)
 * 二级: 技能条目
 * 支持拖拽移动技能到不同目录
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  SkillScanner,
  ScannedSkill,
  LocationTag,
  GroupedSkills,
  ProjectSkillGroup,
} from "../store/SkillScanner";
import {
  CLAUDE_SKILLS_DIR,
  OPENCLAW_SKILLS_DIR,
  AGENT_SKILLS_DIR,
} from "../config/ConfigResolver";
import { t } from "../i18n";

type TreeNode = SourceGroupItem | ProjectSubGroupItem | SkillItem;

const DRAG_MIME = "application/vnd.code.tree.skillhubinstalled";

export class InstalledSkillsProvider
  implements
    vscode.TreeDataProvider<TreeNode>,
    vscode.TreeDragAndDropController<TreeNode>
{
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  // DragAndDropController 属性
  readonly dragMimeTypes = [DRAG_MIME];
  readonly dropMimeTypes = [DRAG_MIME];

  constructor(private scanner: SkillScanner) {}

  refresh(): void {
    this.scanner.refresh();
    this._onDidChange.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.buildGroups();
    }
    if (element instanceof SourceGroupItem) {
      if (element.projectSubGroups && element.projectSubGroups.length > 0) {
        return element.projectSubGroups;
      }
      return element.children.map((s) => new SkillItem(s));
    }
    if (element instanceof ProjectSubGroupItem) {
      return element.children.map((s) => new SkillItem(s));
    }
    return [];
  }

  // ── Drag ──────────────────────────────────────────────
  handleDrag(
    source: readonly TreeNode[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    const skills = source.filter(
      (n): n is SkillItem => n instanceof SkillItem && !n.isStandaloneFile
    );
    if (skills.length === 0) return;

    const payload = skills.map((s) => ({
      slug: s.slug,
      sourceDir: s.skillDir,
      sourceTag: s.locationTag,
    }));
    dataTransfer.set(DRAG_MIME, new vscode.DataTransferItem(JSON.stringify(payload)));
  }

  // ── Drop ──────────────────────────────────────────────
  async handleDrop(
    target: TreeNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    if (!target) return;

    const targetBaseDir = this.resolveDropTarget(target);
    if (!targetBaseDir) return;

    const raw = dataTransfer.get(DRAG_MIME);
    if (!raw) return;

    let items: Array<{ slug: string; sourceDir: string; sourceTag: string }>;
    try {
      items = JSON.parse(raw.value);
    } catch {
      return;
    }

    let moved = 0;
    for (const item of items) {
      // 同目录不移动
      if (path.resolve(path.dirname(item.sourceDir)) === path.resolve(targetBaseDir)) continue;

      const targetDir = path.join(targetBaseDir, item.slug);
      if (fs.existsSync(targetDir)) {
        vscode.window.showWarningMessage(
          `目标目录已存在: ${item.slug}`
        );
        continue;
      }

      try {
        fs.mkdirSync(targetBaseDir, { recursive: true });
        fs.cpSync(item.sourceDir, targetDir, { recursive: true });
        fs.rmSync(item.sourceDir, { recursive: true, force: true });
        moved++;
      } catch (err) {
        vscode.window.showErrorMessage(
          `移动 ${item.slug} 失败: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // 无论是否移动成功，都刷新 TreeView 以反映磁盘实际状态
    // （例如目标已存在时，刷新后技能会按扫描优先级正确归组）
    this.refresh();

    if (moved > 0) {
      vscode.window.showInformationMessage(
        `已移动 ${moved} 个 Skill`
      );
    }
  }

  /** 解析拖放目标为基础目录 */
  private resolveDropTarget(target: TreeNode): string | undefined {
    if (target instanceof SourceGroupItem) {
      if (target.tag && TAG_TO_DIR[target.tag]) {
        return TAG_TO_DIR[target.tag];
      }
      // project 顶层分组: 使用第一个子分组的目录
      if (target.tag === "project" && target.projectSubGroups?.length) {
        return target.projectSubGroups[0].absDir;
      }
      return undefined;
    }
    if (target instanceof ProjectSubGroupItem) {
      return target.absDir;
    }
    if (target instanceof SkillItem) {
      return path.dirname(target.skillDir);
    }
    return undefined;
  }

  private buildGroups(): SourceGroupItem[] {
    const grouped = this.scanner.getGrouped();
    const groups: SourceGroupItem[] = [];

    // 全局分组（claude / openclaw / agent）
    const globalDefs: Array<{
      key: "claude" | "openclaw" | "agent";
      label: string;
      icon: string;
    }> = [
      { key: "claude", label: t("group.claude"), icon: "account" },
      { key: "openclaw", label: t("group.openclaw"), icon: "terminal" },
      { key: "agent", label: t("group.agent"), icon: "robot" },
    ];

    for (const def of globalDefs) {
      const skills = grouped[def.key];
      groups.push(
        new SourceGroupItem(def.label, def.icon, skills.length, skills, def.key)
      );
    }

    // 项目本地分组（按目录层级展示）
    const projectGroups = grouped.projectGroups;
    if (projectGroups.length > 0) {
      const totalSkills = projectGroups.reduce((sum, g) => sum + g.skills.length, 0);
      const projectGroup = new SourceGroupItem(
        t("group.project"), "folder-opened", totalSkills, [], "project"
      );
      projectGroup.projectSubGroups = projectGroups.map(
        (pg) => new ProjectSubGroupItem(pg.relDir, pg.absDir, pg.skills)
      );
      groups.push(projectGroup);
    }

    if (groups.length === 0) {
      return [new SourceGroupItem(t("group.empty"), "info", 0, [], undefined)];
    }

    return groups;
  }
}

// ── 目录标签 → 实际路径映射 ──────────────────────────────

const TAG_TO_DIR: Partial<Record<LocationTag, string>> = {
  claude: CLAUDE_SKILLS_DIR,
  openclaw: OPENCLAW_SKILLS_DIR,
  agent: AGENT_SKILLS_DIR,
};

// ── 来源分组节点 ─────────────────────────────────────────

export class SourceGroupItem extends vscode.TreeItem {
  /** 分组对应的 LocationTag（用于拖拽落点判断） */
  public readonly tag: LocationTag | undefined;
  /** 项目本地技能的子分组（按目录层级） */
  public projectSubGroups?: ProjectSubGroupItem[];

  constructor(
    label: string,
    icon: string,
    count: number,
    public readonly children: ScannedSkill[],
    tag: LocationTag | undefined
  ) {
    super(
      label,
      tag === "project"
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    );
    this.tag = tag;
    this.description = count > 0 ? `${count}` : "";
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = "sourceGroup";
  }
}

// ── 项目子分组节点 ───────────────────────────────────────

export class ProjectSubGroupItem extends vscode.TreeItem {
  public readonly absDir: string;
  constructor(
    relDir: string,
    absDir: string,
    public readonly children: ScannedSkill[]
  ) {
    super(relDir, vscode.TreeItemCollapsibleState.Expanded);
    this.absDir = absDir;
    this.description = `${children.length}`;
    this.iconPath = new vscode.ThemeIcon("folder");
    this.contextValue = "projectSubGroup";
    this.tooltip = relDir;
  }
}

// ── 技能节点 ─────────────────────────────────────────────

const TAG_LABELS: Record<LocationTag, string> = {
  claude: "ⓒ",
  openclaw: "ⓞ",
  agent: "ⓐ",
  project: "ⓟ",
};

export class SkillItem extends vscode.TreeItem {
  public readonly slug: string;
  public readonly skillDir: string;
  public readonly locationTag: LocationTag;
  public readonly isStandaloneFile: boolean;
  public readonly isSymlink: boolean;
  public readonly symlinkTarget?: string;

  constructor(skill: ScannedSkill) {
    super(skill.slug, vscode.TreeItemCollapsibleState.None);
    this.slug = skill.slug;
    this.skillDir = skill.dir;
    this.locationTag = skill.locations[0] ?? "project";
    this.isStandaloneFile = !!skill.filePath;
    this.isSymlink = !!skill.isSymlink;
    this.symlinkTarget = skill.symlinkTarget;

    // 描述: 位置徽章 + 版本 + symlink 标记
    const tags = skill.locations.map((t) => TAG_LABELS[t]).join("");
    const ver = skill.version ? ` v${skill.version}` : "";
    const linkMark = skill.isSymlink ? " 🔗" : "";
    this.description = `${tags}${ver}${linkMark}`;

    // Tooltip
    const locNames = skill.locations
      .map((loc) => t(`loc.${loc}`))
      .join(", ");
    const symlinkTip = skill.isSymlink
      ? `\n🔗 ${t("msg.symlink")}: ${skill.symlinkTarget}`
      : "";
    this.tooltip = `${skill.slug}\n${t("common.location")}: ${locNames}${ver ? `\n${t("common.version")}: ${skill.version}` : ""}\n${t("common.directory")}: ${skill.dir}${symlinkTip}`;

    // 图标 & 行为: 单文件条目 vs 普通技能
    if (skill.filePath) {
      this.iconPath = new vscode.ThemeIcon("note");
      this.contextValue = "instructionFile";
      this.command = {
        command: "vscode.open",
        title: t("msg.viewDetail"),
        arguments: [vscode.Uri.file(skill.filePath)],
      };
    } else {
      this.iconPath = new vscode.ThemeIcon(
        skill.isSymlink ? "link" :
        skill.locations.includes("project") && skill.locations.length === 1 ? "file-code" : "extensions"
      );
      // 右键菜单 context——区分 symlink 和普通技能
      this.contextValue = skill.isSymlink ? "skillSymlink" : "skill";

      // 点击打开 SKILL.md
      if (skill.hasSkillMd) {
        this.command = {
          command: "skillhub.openSkillMd",
          title: t("msg.viewDetail"),
          arguments: [skill.dir],
        };
      }
    }
  }
}
