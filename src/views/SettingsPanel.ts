/**
 * SettingsPanel — Skillhub 控制面板 Webview
 *
 * 提供：数据源切换、3 个部署位置开关、端点覆盖
 */

import * as vscode from "vscode";
import * as fs from "fs";
import { execFile } from "child_process";
import {
  CLAUDE_SKILLS_DIR,
  OPENCLAW_SKILLS_DIR,
  AGENT_SKILLS_DIR,
  getSourceInfo,
  resolve as resolveConfig,
} from "../config/ConfigResolver";
import { SkillScanner } from "../store/SkillScanner";
import { t, currentLocale } from "../i18n";

export class SettingsPanel {
  private static currentPanel: SettingsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, private scanner: SkillScanner) {
    this.panel = panel;
    this.panel.webview.html = this.buildHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static show(scanner: SkillScanner): void {
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.scanner = scanner;
      SettingsPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      SettingsPanel.currentPanel.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "skillhub.settings",
      t("settings.title"),
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, scanner);
  }

  refresh(): void {
    this.panel.webview.html = this.buildHtml();
  }

  private dispose(): void {
    SettingsPanel.currentPanel = undefined;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  private async handleMessage(msg: { command: string; key?: string; value?: unknown }): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("skillhub");
    switch (msg.command) {
      case "toggle":
        if (msg.key) {
          await cfg.update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
          this.refresh();
        }
        break;
      case "setString":
        if (msg.key) {
          await cfg.update(msg.key, String(msg.value ?? ""), vscode.ConfigurationTarget.Global);
          this.refresh();
        }
        break;
      case "setClickAction":
        await cfg.update("skillClickAction", String(msg.value ?? "preview"), vscode.ConfigurationTarget.Global);
        this.refresh();
        break;
      case "setSource":
        await cfg.update("source", String(msg.value ?? "china"), vscode.ConfigurationTarget.Global);
        this.refresh();
        break;
      case "setLanguage":
        await cfg.update("language", String(msg.value ?? "auto"), vscode.ConfigurationTarget.Global);
        this.refresh();
        break;
      case "openFolder": {
        const dir = String(msg.value ?? "");
        if (!dir) break;
        // 如果目录不存在，自动创建它（在 Linux 上技能目录通常不会预先存在）
        if (!fs.existsSync(dir)) {
          try {
            fs.mkdirSync(dir, { recursive: true });
          } catch {
            vscode.window.showWarningMessage(`${t("msg.dirNotExist")}: ${dir}`);
            break;
          }
        }
        const platform = process.platform;
        if (platform === "win32") {
          execFile("explorer.exe", [dir]);
        } else if (platform === "darwin") {
          execFile("open", [dir]);
        } else {
          execFile("xdg-open", [dir]);
        }
        break;
      }
    }
  }

  private buildHtml(): string {
    const config = resolveConfig();
    const cfg = vscode.workspace.getConfiguration("skillhub");

    const targetClaude = cfg.get<boolean>("targetClaude", true);
    const targetOpenclaw = cfg.get<boolean>("targetOpenclaw", false);
    const targetAgent = cfg.get<boolean>("targetAgent", false);
    const clickAction = cfg.get<string>("skillClickAction", "preview");
    const currentSource = config.source;
    const locale = currentLocale();
    const langSetting = cfg.get<string>("language", "auto");

    // 扫描技能数量
    const grouped = this.scanner.refresh();

    const claudeCount = grouped.claude.length;
    const openclawCount = grouped.openclaw.length;
    const agentCount = grouped.agent.length;
    const projectCount = grouped.project.length;

    const projectDirs = [...new Set(grouped.project.map((s) => s.dir.replace(/[\\/][^\\/]+$/, "")))];
    const dirExists = (dir: string) => fs.existsSync(dir);

    const nonce = getNonce();

    const sourceInfo = getSourceInfo();
    const chinaInfo = sourceInfo.china;
    const globalInfo = sourceInfo.global;

    return /* html */ `<!DOCTYPE html>
<html lang="${locale === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(t("settings.title"))}</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border, #444);
      --card-bg: var(--vscode-editorWidget-background, #1e1e1e);
      --accent: var(--vscode-textLink-foreground, #3794ff);
      --badge-bg: var(--vscode-badge-background, #4d4d4d);
      --badge-fg: var(--vscode-badge-foreground, #fff);
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-border: var(--vscode-input-border, #555);
      --input-fg: var(--vscode-input-foreground, #ccc);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #fff);
      --success: #4ec9b0;
      --muted: var(--vscode-descriptionForeground, #999);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background: var(--bg);
      padding: 24px 32px;
      line-height: 1.6;
    }
    h1 { font-size: 1.4em; margin-bottom: 20px; font-weight: 600; }
    h2 {
      font-size: 1.05em;
      font-weight: 600;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section { margin-bottom: 28px; }

    /* ── 数据源卡片 ── */
    .source-card {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 14px 16px;
      border: 2px solid var(--border);
      border-radius: 6px;
      background: var(--card-bg);
      margin-bottom: 10px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .source-card:hover { border-color: var(--accent); }
    .source-card.active { border-color: var(--accent); }
    .source-card .radio {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid var(--muted);
      flex-shrink: 0;
      margin-top: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .source-card.active .radio {
      border-color: var(--accent);
    }
    .source-card.active .radio::after {
      content: '';
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--accent);
    }
    .source-card .info { flex: 1; min-width: 0; }
    .source-card .name { font-weight: 600; font-size: 1em; }
    .source-card .desc { font-size: 0.85em; color: var(--muted); margin-top: 2px; }
    .source-card .url { font-size: 0.82em; color: var(--accent); margin-top: 2px; }

    /* ── 部署位置卡片 ── */
    .target-card {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card-bg);
      margin-bottom: 10px;
      transition: border-color 0.15s;
    }
    .target-card.active { border-color: var(--accent); }
    .target-card .info { flex: 1; min-width: 0; }
    .target-card .title-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .target-card .name { font-weight: 600; font-size: 1em; }
    .target-card .badge {
      font-size: 0.75em;
      padding: 1px 7px;
      border-radius: 9px;
      background: var(--badge-bg);
      color: var(--badge-fg);
    }
    .target-card .path {
      font-size: 0.88em;
      color: var(--muted);
      word-break: break-all;
    }
    .target-card .path a {
      color: var(--accent);
      cursor: pointer;
      text-decoration: none;
    }
    .target-card .path a:hover { text-decoration: underline; }
    .target-card .stats {
      font-size: 0.85em;
      color: var(--muted);
      margin-top: 2px;
    }
    .target-card .stats .count { color: var(--success); font-weight: 600; }

    /* ── 开关 ── */
    .switch {
      position: relative;
      width: 42px;
      height: 22px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .switch .slider {
      position: absolute;
      inset: 0;
      background: var(--badge-bg);
      border-radius: 22px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .switch .slider::before {
      content: '';
      position: absolute;
      width: 16px;
      height: 16px;
      left: 3px;
      top: 3px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .switch input:checked + .slider { background: var(--accent); }
    .switch input:checked + .slider::before { transform: translateX(20px); }

    /* ── 语言选择 ── */
    .lang-group { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .lang-btn {
      padding: 6px 18px; border: 2px solid var(--border); border-radius: 6px;
      background: var(--card-bg); color: var(--fg); cursor: pointer;
      font-size: 0.92em; transition: all 0.15s;
    }
    .lang-btn:hover { border-color: var(--accent); }
    .lang-btn.active { border-color: var(--accent); background: var(--accent); color: var(--btn-fg); }

    /* ── 输入框 ── */
    .input-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 8px;
    }
    .input-row input[type="text"] {
      flex: 1;
      padding: 5px 10px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--input-fg);
      border-radius: 4px;
      font-size: 0.92em;
      font-family: inherit;
    }
    .input-row input[type="text"]:focus {
      outline: none;
      border-color: var(--accent);
    }
    .input-row button {
      padding: 5px 14px;
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.92em;
    }
    .input-row button:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <h1>${escHtml(t("settings.title"))}</h1>

  <!-- ── 语言 ── -->
  <div class="section">
    <h2>${escHtml(t("settings.language"))}</h2>
    <div class="lang-group">
      <button class="lang-btn ${langSetting === "auto" ? "active" : ""}" data-lang="auto">${escHtml(t("settings.langAuto"))}</button>
      <button class="lang-btn ${langSetting === "zh" ? "active" : ""}" data-lang="zh">${escHtml(t("settings.langZh"))}</button>
      <button class="lang-btn ${langSetting === "en" ? "active" : ""}" data-lang="en">${escHtml(t("settings.langEn"))}</button>
    </div>
  </div>

  <!-- ── 数据源 ── -->
  <div class="section">
    <h2>${escHtml(t("settings.source"))}</h2>
    <div class="source-card ${currentSource === "china" ? "active" : ""}" data-source="china">
      <div class="radio"></div>
      <div class="info">
        <div class="name">${escHtml(chinaInfo.label)}</div>
        <div class="desc">${escHtml(chinaInfo.description)}</div>
        <div class="url">${escHtml(chinaInfo.url)}</div>
      </div>
    </div>
    <div class="source-card ${currentSource === "global" ? "active" : ""}" data-source="global">
      <div class="radio"></div>
      <div class="info">
        <div class="name">${escHtml(globalInfo.label)}</div>
        <div class="desc">${escHtml(globalInfo.description)}</div>
        <div class="url">${escHtml(globalInfo.url)}</div>
      </div>
    </div>
  </div>

  <!-- ── 部署位置 ── -->
  <div class="section">
    <h2>${escHtml(t("settings.deploy"))}</h2>

    <div class="target-card ${targetClaude ? "active" : ""}">
      <label class="switch">
        <input type="checkbox" data-toggle="targetClaude" ${targetClaude ? "checked" : ""} />
        <span class="slider"></span>
      </label>
      <div class="info">
        <div class="title-row">
          <span class="name">${escHtml(t("target.claude"))}</span>
        </div>
        <div class="path">
          <a data-folder="${escHtml(CLAUDE_SKILLS_DIR)}">${CLAUDE_SKILLS_DIR}</a>
        </div>
        <div class="stats">
          ${dirExists(CLAUDE_SKILLS_DIR)
            ? `<span class="count">${claudeCount}</span> ${escHtml(t("settings.skillsCount"))}`
            : escHtml(t("settings.dirNotExist"))}
        </div>
      </div>
    </div>

    <div class="target-card ${targetOpenclaw ? "active" : ""}">
      <label class="switch">
        <input type="checkbox" data-toggle="targetOpenclaw" ${targetOpenclaw ? "checked" : ""} />
        <span class="slider"></span>
      </label>
      <div class="info">
        <div class="title-row">
          <span class="name">${escHtml(t("target.openclaw"))}</span>
        </div>
        <div class="path">
          <a data-folder="${escHtml(OPENCLAW_SKILLS_DIR)}">${OPENCLAW_SKILLS_DIR}</a>
        </div>
        <div class="stats">
          ${dirExists(OPENCLAW_SKILLS_DIR)
            ? `<span class="count">${openclawCount}</span> ${escHtml(t("settings.skillsCount"))}`
            : escHtml(t("settings.dirNotExist"))}
        </div>
      </div>
    </div>

    <div class="target-card ${targetAgent ? "active" : ""}">
      <label class="switch">
        <input type="checkbox" data-toggle="targetAgent" ${targetAgent ? "checked" : ""} />
        <span class="slider"></span>
      </label>
      <div class="info">
        <div class="title-row">
          <span class="name">${escHtml(t("target.agent"))}</span>
        </div>
        <div class="path">
          <a data-folder="${escHtml(AGENT_SKILLS_DIR)}">${AGENT_SKILLS_DIR}</a>
        </div>
        <div class="stats">
          ${dirExists(AGENT_SKILLS_DIR)
            ? `<span class="count">${agentCount}</span> ${escHtml(t("settings.skillsCount"))}`
            : escHtml(t("settings.dirNotExist"))}
        </div>
      </div>
    </div>

    ${projectCount > 0 ? `
    <div class="target-card active" style="border-color: #d19a66;">
      <div style="width: 42px; flex-shrink: 0; text-align: center; font-size: 1.2em; margin-top: 2px;">\ud83d\udcc1</div>
      <div class="info">
        <div class="title-row">
          <span class="name">${escHtml(t("settings.currentProject"))}</span>
          <span class="badge" style="background: #d19a66; color: #1e1e1e;">${escHtml(t("settings.local"))}</span>
        </div>
        ${projectDirs.map((d) => `<div class="path"><a data-folder="${escHtml(d)}">${d}</a></div>`).join("")}
        <div class="stats">
          <span class="count">${projectCount}</span> ${escHtml(t("settings.skillsDetected"))}
        </div>
      </div>
    </div>` : ""}
  </div>

  <!-- ── 点击行为 ── -->
  <div class="section">
    <h2>${escHtml(t("settings.clickAction"))}</h2>
    <div style="margin-bottom: 6px; font-size: 0.85em; color: var(--muted);">
      ${escHtml(t("settings.clickActionHint"))}
    </div>
    <div class="lang-group">
      <button class="lang-btn ${clickAction === "preview" ? "active" : ""}" data-click="preview">${escHtml(t("settings.clickPreview"))}</button>
      <button class="lang-btn ${clickAction === "edit" ? "active" : ""}" data-click="edit">${escHtml(t("settings.clickEdit"))}</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ── 语言切换 ──
    document.querySelectorAll('.lang-btn[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ command: 'setLanguage', value: btn.dataset.lang });
      });
    });

    // ── 数据源切换 ──
    document.querySelectorAll('.source-card').forEach(card => {
      card.addEventListener('click', () => {
        vscode.postMessage({ command: 'setSource', value: card.dataset.source });
      });
    });

    // ── 开关绑定 ──
    document.querySelectorAll('input[data-toggle]').forEach(input => {
      input.addEventListener('change', () => {
        vscode.postMessage({ command: 'toggle', key: input.dataset.toggle, value: input.checked });
      });
    });

    // ── 路径链接 ──
    document.querySelectorAll('a[data-folder]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        vscode.postMessage({ command: 'openFolder', value: link.dataset.folder });
      });
    });

    // ── 点击行为切换 ──
    document.querySelectorAll('.lang-btn[data-click]').forEach(btn => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ command: 'setClickAction', value: btn.dataset.click });
      });
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

