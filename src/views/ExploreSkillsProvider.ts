/**
 * ExploreSkillsProvider — 发现/搜索技能的 TreeView 数据源
 */

import * as vscode from "vscode";
import { SkillhubClient, SkillSearchResult } from "../api/SkillhubClient";
import { LockfileManager } from "../store/LockfileManager";

export class ExploreSkillsProvider
  implements vscode.TreeDataProvider<ExploreTreeItem>
{
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private results: SkillSearchResult[] = [];
  private searching = false;
  private lastQuery = "";

  constructor(
    private client: SkillhubClient,
    private lockfile: LockfileManager
  ) {}

  async search(query: string): Promise<void> {
    this.lastQuery = query;
    this.searching = true;
    this._onDidChange.fire();

    try {
      this.results = await this.client.search(query);
    } catch (err) {
      this.results = [];
      vscode.window.showErrorMessage(
        `搜索失败: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      this.searching = false;
      this._onDidChange.fire();
    }
  }

  clear(): void {
    this.results = [];
    this.lastQuery = "";
    this._onDidChange.fire();
  }

  getTreeItem(element: ExploreTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ExploreTreeItem[] {
    if (this.searching) {
      return [
        new ExploreTreeItem("正在搜索...", "", "", true, false),
      ];
    }

    if (this.results.length === 0 && this.lastQuery) {
      return [
        new ExploreTreeItem(
          `未找到 "${this.lastQuery}" 相关 Skill`,
          "",
          "",
          true,
          false
        ),
      ];
    }

    if (this.results.length === 0) {
      return [
        new ExploreTreeItem(
          "使用搜索按钮查找 Skill",
          "",
          "",
          true,
          false
        ),
      ];
    }

    return this.results.map((r) => {
      const installed = !!this.lockfile.get(r.slug);
      return new ExploreTreeItem(
        r.slug,
        r.version,
        r.description,
        false,
        installed
      );
    });
  }
}

export class ExploreTreeItem extends vscode.TreeItem {
  constructor(
    public readonly slug: string,
    public readonly version: string,
    public readonly desc: string,
    placeholder: boolean,
    installed: boolean
  ) {
    super(slug, vscode.TreeItemCollapsibleState.None);

    if (placeholder) {
      this.contextValue = "placeholder";
      this.iconPath = new vscode.ThemeIcon("info");
      return;
    }

    this.description = version ? `v${version}` : "";
    this.tooltip = `${slug}\n${desc}`;
    this.contextValue = installed ? "exploreInstalled" : "exploreAvailable";
    this.iconPath = installed
      ? new vscode.ThemeIcon("check")
      : new vscode.ThemeIcon("cloud-download");

    if (!installed) {
      this.command = {
        command: "skillhub.install",
        title: "安装",
        arguments: [slug],
      };
    }
  }
}
