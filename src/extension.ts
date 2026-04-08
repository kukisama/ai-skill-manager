/**
 * Skillhub Manager — VS Code 扩展入口
 *
 * 双数据源（国内 SkillHub / 国际 ClawHub），直接调 HTTP API。
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  resolve as resolveConfig,
  buildTargetDirs,
  CLAUDE_SKILLS_DIR,
  OPENCLAW_SKILLS_DIR,
  AGENT_SKILLS_DIR,
} from "./config/ConfigResolver";
import { SkillhubClient } from "./api/SkillhubClient";
import { LockfileManager } from "./store/LockfileManager";
import { SkillInstaller } from "./store/SkillInstaller";
import { SkillScanner } from "./store/SkillScanner";
import {
  InstalledSkillsProvider,
} from "./views/InstalledSkillsProvider";
import { SearchPanel } from "./views/SearchPanel";
import { SettingsPanel } from "./views/SettingsPanel";
import { t } from "./i18n";

let client: SkillhubClient;
let lockfile: LockfileManager;
let installer: SkillInstaller;
let scanner: SkillScanner;
let installedProvider: InstalledSkillsProvider;
let searchPanel: SearchPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // ── 初始化核心服务 ───────────────────────────────────
  const config = resolveConfig();
  client = new SkillhubClient(config.endpoints);

  const targetDirs = buildTargetDirs(config.targets);
  lockfile = new LockfileManager(config.lockfileHome, targetDirs[0]);
  installer = new SkillInstaller(client, lockfile, targetDirs);

  // ── 技能扫描器 ────────────────────────────────────────
  scanner = new SkillScanner();

  // ── TreeView ──────────────────────────────────────────
  installedProvider = new InstalledSkillsProvider(scanner);

  const treeView = vscode.window.createTreeView("skillhub.installed", {
    treeDataProvider: installedProvider,
    dragAndDropController: installedProvider,
    canSelectMany: true,
  });

  context.subscriptions.push(treeView);

  // ── 监听设置变化，刷新目标/端点 ──────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("skillhub.targetClaude") ||
        e.affectsConfiguration("skillhub.targetOpenclaw") ||
        e.affectsConfiguration("skillhub.targetAgent")
      ) {
        const fresh = resolveConfig();
        const freshDirs = buildTargetDirs(fresh.targets);
        lockfile.updatePaths(fresh.lockfileHome, freshDirs[0]);
        installer.updateTargets(freshDirs);
        installedProvider.refresh();
      }

      if (e.affectsConfiguration("skillhub.source")) {
        const fresh = resolveConfig();
        client.updateEndpoints(fresh.endpoints);
        if (searchPanel) {
          searchPanel.notifySourceChanged();
        }
        const sourceName = fresh.source === "global" ? t("msg.sourceGlobalFull") : t("msg.sourceChinaFull");
        vscode.window.showInformationMessage(
          `AI Skills: ${t("msg.sourceSwitched")} ${sourceName}`
        );
      }

      if (e.affectsConfiguration("skillhub.language")) {
        // 语言切换 → 刷新 TreeView（i18n 标签更新）
        installedProvider.refresh();
      }
    })
  );

  // ── 命令注册 ─────────────────────────────────────────

  // 搜索
  context.subscriptions.push(
    vscode.commands.registerCommand("skillhub.search", () => {
      searchPanel = SearchPanel.show(context.extensionUri, client, lockfile, async (slug) => {
        await installSkill(slug);
      });
    })
  );

  // 安装
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "skillhub.install",
      async (slugOrItem?: string | { slug?: string }) => {
        let slug: string | undefined;
        if (typeof slugOrItem === "string") {
          slug = slugOrItem;
        } else if (slugOrItem && typeof slugOrItem.slug === "string") {
          slug = slugOrItem.slug;
        }

        if (!slug) {
          slug = await vscode.window.showInputBox({
            prompt: t("msg.inputSlug"),
            placeHolder: t("msg.inputSlugHint"),
          });
        }
        if (!slug) return;
        await installSkill(slug);
      }
    )
  );

  // 卸载
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "skillhub.uninstall",
      async (item?: { slug?: string; skillDir?: string; isSymlink?: boolean; symlinkTarget?: string }) => {
        const slug = item?.slug;
        if (!slug) return;

        const skillDir = item?.skillDir;

        // symlink: 仅删链接，不删实际目录
        if (item?.isSymlink && skillDir) {
          const confirm = await vscode.window.showWarningMessage(
            `${t("msg.symlinkDeleteConfirm")} "${slug}"?\n🔗 → ${item.symlinkTarget ?? "?"}`,
            { modal: true },
            t("msg.deleteLink")
          );
          if (confirm !== t("msg.deleteLink")) return;

          try {
            fs.unlinkSync(skillDir);
          } catch (err) {
            vscode.window.showErrorMessage(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
            return;
          }
          installedProvider.refresh();
          vscode.window.showInformationMessage(`${t("msg.uninstallDone")}: ${slug} (🔗)`);
          return;
        }

        // 实体目录: 检查是否有符号链接指向这个目录
        if (skillDir) {
          const realPath = fs.realpathSync(skillDir);
          const linkedFrom = findSymlinksPointingTo(realPath, slug);
          if (linkedFrom.length > 0) {
            const dirs = linkedFrom.join("\n");
            const confirm = await vscode.window.showWarningMessage(
              `${t("msg.deleteOriginalWarn")} "${slug}"?\n\n${dirs}`,
              { modal: true },
              t("msg.deleteOriginal")
            );
            if (confirm !== t("msg.deleteOriginal")) return;

            fs.rmSync(skillDir, { recursive: true, force: true });
            installedProvider.refresh();
            vscode.window.showInformationMessage(`${t("msg.uninstallDone")}: ${slug}`);
            return;
          }
        }

        // 普通删除流程
        const confirm = await vscode.window.showWarningMessage(
          `${t("msg.uninstallConfirm")} "${slug}"?`,
          { modal: true },
          t("msg.uninstallBtn")
        );
        if (confirm !== t("msg.uninstallBtn")) return;

        if (skillDir) {
          // 单目录删除（而不是 installer.uninstall 全局删）
          fs.rmSync(skillDir, { recursive: true, force: true });
        } else {
          installer.uninstall(slug);
        }
        installedProvider.refresh();
        vscode.window.showInformationMessage(`${t("msg.uninstallDone")}: ${slug}`);
      }
    )
  );

  // 升级全部
  context.subscriptions.push(
    vscode.commands.registerCommand("skillhub.upgradeAll", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `AI Skills: ${t("msg.checkUpdate")}`,
          cancellable: false,
        },
        async (progress) => {
          const grouped = scanner.getGrouped();
          const allSkills = [
            ...grouped.claude,
            ...grouped.openclaw,
            ...grouped.agent,
          ].filter((s) => s.version);

          if (allSkills.length === 0) {
            vscode.window.showInformationMessage(t("msg.noVersionInfo"));
            return;
          }

          progress.report({ message: `${t("msg.checking")} ${allSkills.length} ...` });

          const slugs = [...new Set(allSkills.map((s) => s.slug))];
          const details = await client.fetchSkillDetails(slugs);

          const upgradable: Array<{ slug: string; current: string; latest: string }> = [];
          for (const skill of allSkills) {
            const detail = details.get(skill.slug);
            if (!detail) continue;
            const latestVer = detail.version;
            if (latestVer && latestVer !== skill.version && isNewer(latestVer, skill.version)) {
              if (!upgradable.some((u) => u.slug === skill.slug)) {
                upgradable.push({ slug: skill.slug, current: skill.version, latest: latestVer });
              }
            }
          }

          if (upgradable.length === 0) {
            vscode.window.showInformationMessage(t("msg.noUpgradable"));
            return;
          }

          const msg = upgradable
            .map((u) => `${u.slug}: ${u.current} → ${u.latest}`)
            .join("\n");

          const choice = await vscode.window.showInformationMessage(
            `${upgradable.length} ${t("msg.upgradable")}:\n${msg}`,
            t("msg.upgradeAll"),
            t("common.cancel")
          );
          if (choice !== t("msg.upgradeAll")) return;

          for (const u of upgradable) {
            progress.report({ message: `${t("msg.upgrading")} ${u.slug}...` });
            try {
              await installer.install(u.slug, true, progress);
            } catch (err) {
              vscode.window.showErrorMessage(
                `${t("msg.upgradeFail")} ${u.slug}: ${err instanceof Error ? err.message : String(err)}`
              );
            }
          }
          installedProvider.refresh();
          vscode.window.showInformationMessage(t("msg.upgradeDone"));
        }
      );
    })
  );

  // 刷新
  context.subscriptions.push(
    vscode.commands.registerCommand("skillhub.refresh", () => {
      installedProvider.refresh();
    })
  );

  // 查看 SKILL.md
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "skillhub.openSkillMd",
      async (skillDir: string) => {
        const skillMdPath = path.join(skillDir, "SKILL.md");
        if (fs.existsSync(skillMdPath)) {
          const clickAction = vscode.workspace
            .getConfiguration("skillhub")
            .get<string>("skillClickAction", "preview");
          const doc = await vscode.workspace.openTextDocument(skillMdPath);
          if (clickAction === "edit") {
            await vscode.window.showTextDocument(doc);
          } else {
            await vscode.commands.executeCommand("markdown.showPreview", doc.uri);
          }
        } else {
          vscode.window.showWarningMessage(t("msg.noSkillMd"));
        }
      }
    )
  );

  // 兼容旧命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "skillhub.openDetail",
      async (slug: string) => {
        const skillMdPath = path.join(lockfile.skillDir(slug), "SKILL.md");
        if (fs.existsSync(skillMdPath)) {
          const doc = await vscode.workspace.openTextDocument(skillMdPath);
          await vscode.commands.executeCommand("markdown.showPreview", doc.uri);
        }
      }
    )
  );

  // 打开控制面板
  context.subscriptions.push(
    vscode.commands.registerCommand("skillhub.openSettings", () => {
      SettingsPanel.show(scanner);
    })
  );
}

export function deactivate(): void {
  // 清理由框架自动处理 (context.subscriptions)
}

// ── 内部辅助 ───────────────────────────────────────────

async function installSkill(slug: string): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `AI Skills: ${t("common.install")} ${slug}`,
      cancellable: false,
    },
    async (progress) => {
      await installer.install(slug, false, progress);
      installedProvider.refresh();
      vscode.window.showInformationMessage(`${t("msg.installDone")}: ${slug}`);
    }
  );
}

/** 简易版本号比较：latest > current 时返回 true */
function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/** 在所有全局技能目录中查找指向 targetRealPath 的 symlink/junction */
function findSymlinksPointingTo(targetRealPath: string, slug: string): string[] {
  const dirs = [CLAUDE_SKILLS_DIR, OPENCLAW_SKILLS_DIR, AGENT_SKILLS_DIR];
  const results: string[] = [];
  for (const base of dirs) {
    const candidate = path.join(base, slug);
    try {
      const lstat = fs.lstatSync(candidate);
      if (lstat.isSymbolicLink()) {
        const real = fs.realpathSync(candidate);
        if (real === targetRealPath) {
          results.push(candidate);
        }
      }
    } catch { /* */ }
  }
  return results;
}
