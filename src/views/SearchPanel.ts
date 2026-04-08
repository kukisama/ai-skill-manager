/**
 * SearchPanel — 发现 + 搜索面板
 *
 * 顶部分类标签 → 点击按分类浏览
 * 搜索框 → 关键词搜索
 * 搜索/分类结果从详情 API 拉取 downloads/installs/stars
 */

import * as vscode from "vscode";
import { SkillhubClient, SkillSearchResult, SkillDetail } from "../api/SkillhubClient";
import { LockfileManager } from "../store/LockfileManager";
import { resolveSource, getSourceInfo, SourceType } from "../config/ConfigResolver";
import { t, currentLocale } from "../i18n";

export class SearchPanel {
  private static currentPanel: SearchPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  static show(
    extensionUri: vscode.Uri,
    client: SkillhubClient,
    lockfile: LockfileManager,
    onInstall: (slug: string) => Promise<void>
  ): SearchPanel {
    if (SearchPanel.currentPanel) {
      SearchPanel.currentPanel.panel.reveal();
      return SearchPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      "skillhubSearch",
      t("search.title"),
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    SearchPanel.currentPanel = new SearchPanel(
      panel,
      client,
      lockfile,
      onInstall
    );
    return SearchPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private client: SkillhubClient,
    private lockfile: LockfileManager,
    private onInstall: (slug: string) => Promise<void>
  ) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // 初始化时发送分类列表和当前数据源
    this.loadCategories();
    this.sendSourceInfo();

    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.type) {
          case "search":
            await this.handleSearch(String(msg.query ?? "").trim());
            break;
          case "category":
            await this.handleCategory(String(msg.key ?? "").trim());
            break;
          case "switchSource": {
            const newSource = resolveSource() === "china" ? "global" : "china";
            await vscode.workspace
              .getConfiguration("skillhub")
              .update("source", newSource, vscode.ConfigurationTarget.Global);
            break;
          }
          case "install": {
            const slug = String(msg.slug ?? "").trim();
            if (!slug) return;
            try {
              await this.onInstall(slug);
              this.panel.webview.postMessage({ type: "installComplete", slug });
            } catch (err) {
              this.panel.webview.postMessage({
                type: "installError",
                slug,
                message: err instanceof Error ? err.message : String(err),
              });
            }
            break;
          }
        }
      },
      null,
      this.disposables
    );
  }

  /** 通知 webview 数据源已切换 */
  notifySourceChanged(): void {
    this.sendSourceInfo();
  }

  private sendSourceInfo(): void {
    const source = resolveSource();
    const info = getSourceInfo()[source];
    this.panel.webview.postMessage({
      type: "sourceChanged",
      source,
      label: info.label,
    });
  }

  private async loadCategories(): Promise<void> {
    try {
      const cats = await this.client.fetchCategories();
      this.panel.webview.postMessage({ type: "categories", categories: cats });
    } catch { /* 分类加载失败不阻塞 */ }
  }

  private async handleSearch(query: string): Promise<void> {
    if (!query) return;
    this.panel.webview.postMessage({ type: "loading" });
    try {
      const results = await this.client.search(query);
      await this.enrichAndSend(results);
    } catch (err) {
      this.panel.webview.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleCategory(key: string): Promise<void> {
    if (!key) return;
    this.panel.webview.postMessage({ type: "loading" });
    try {
      const results = await this.client.searchByCategory(key);
      await this.enrichAndSend(results);
    } catch (err) {
      this.panel.webview.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async enrichAndSend(results: SkillSearchResult[]): Promise<void> {
    const slugs = results.map((r) => r.slug);
    const details = await this.client.fetchSkillDetails(slugs);
    const enriched = results.map((r) => {
      const d = details.get(r.slug);
      return {
        slug: r.slug,
        name: d?.displayName || r.name || r.slug,
        description: d?.summaryZh || d?.summary || r.description || r.summary || "",
        version: d?.version || r.version,
        owner: d?.owner || "",
        category: d?.category || "",
        downloads: d?.downloads ?? 0,
        installs: d?.installs ?? 0,
        stars: d?.stars ?? 0,
      };
    });
    this.panel.webview.postMessage({
      type: "results",
      results: enriched,
      installed: this.getInstalledSlugs(),
    });
  }

  private getInstalledSlugs(): string[] {
    return this.lockfile.listInstalled().map((s) => s.slug);
  }

  private dispose(): void {
    SearchPanel.currentPanel = undefined;
    for (const d of this.disposables) d.dispose();
  }

  private getHtml(): string {
    const nonce = getNonce();
    const locale = currentLocale();
    // Pass i18n strings to webview
    const i18nData = JSON.stringify({
      searchBtn: t("common.search"),
      placeholder: t("search.placeholder"),
      hint: t("search.hint"),
      hintSub: t("search.hintSub"),
      loading: t("common.loading"),
      noResults: t("search.noResults"),
      filter: t("search.filter"),
      install: t("common.install"),
      installed: t("common.installed"),
      installing: t("common.installing"),
      downloads: t("search.downloads"),
      installs: t("search.installs"),
      error: t("common.error"),
      switchSource: t("search.switchSource"),
      author: t("common.author"),
    });
    return /* html */ `<!DOCTYPE html>
<html lang="${locale === "zh" ? "zh-CN" : "en"}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --input-bg: var(--vscode-input-background, #3c3c3c);
    --input-border: var(--vscode-input-border, #555);
    --input-fg: var(--vscode-input-foreground, #ccc);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --card-bg: var(--vscode-editorWidget-background, #1e1e1e);
    --card-border: var(--vscode-editorWidget-border, #333);
    --muted: var(--vscode-descriptionForeground, #999);
    --accent: var(--vscode-textLink-foreground, #3794ff);
    --success: #4ec9b0;
    --badge-bg: var(--vscode-badge-background, #4d4d4d);
    --badge-fg: var(--vscode-badge-foreground, #fff);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--fg);
    background: var(--bg);
    padding: 20px 24px;
    line-height: 1.6;
  }
  h1 { font-size: 1.3em; font-weight: 600; margin-bottom: 8px; }

  /* ── 源切换行 ── */
  .source-row {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 14px;
  }
  .source-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 12px; border-radius: 12px;
    background: var(--badge-bg); color: var(--badge-fg);
    font-size: 0.82em;
  }
  .source-badge .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--success); display: inline-block;
  }
  .switch-btn {
    padding: 3px 12px; border-radius: 12px;
    background: transparent; color: var(--accent);
    border: 1px solid var(--accent); cursor: pointer;
    font-size: 0.82em; transition: all 0.15s;
  }
  .switch-btn:hover { background: var(--accent); color: var(--btn-fg); }

  /* ── 分类标签 ── */
  .categories { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .cat-btn {
    padding: 5px 14px; border: 1px solid var(--card-border); border-radius: 16px;
    background: var(--card-bg); color: var(--fg); cursor: pointer;
    font-size: 0.88em; transition: all 0.15s;
  }
  .cat-btn:hover { border-color: var(--accent); color: var(--accent); }
  .cat-btn.active { background: var(--accent); color: var(--btn-fg); border-color: var(--accent); }

  /* ── 筛选提示 ── */
  .active-filter {
    display: none; align-items: center; gap: 8px;
    margin-bottom: 12px; font-size: 0.88em; color: var(--muted);
  }
  .active-filter.visible { display: flex; }
  .filter-tag {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 10px; background: var(--accent); color: var(--btn-fg);
    border-radius: 12px; font-size: 0.88em;
  }
  .filter-tag .close { cursor: pointer; opacity: 0.8; font-size: 1.1em; line-height: 1; }
  .filter-tag .close:hover { opacity: 1; }

  /* ── 搜索栏 ── */
  .search-bar {
    display: flex; gap: 8px; margin-bottom: 20px;
    position: sticky; top: 0; background: var(--bg);
    padding: 4px 0 12px; z-index: 10;
  }
  .search-bar input {
    flex: 1; padding: 8px 14px;
    border: 1px solid var(--input-border);
    background: var(--input-bg); color: var(--input-fg);
    border-radius: 6px;
    font-size: 14px; outline: none;
  }
  .search-bar input:focus { border-color: var(--accent); }
  .search-bar button {
    padding: 8px 20px; background: var(--btn-bg); color: var(--btn-fg);
    border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;
  }
  .search-bar button:hover { opacity: 0.9; }

  /* ── 卡片 ── */
  .card {
    border: 1px solid var(--card-border); background: var(--card-bg);
    border-radius: 8px; padding: 14px 18px; margin-bottom: 12px;
    transition: border-color 0.15s;
  }
  .card:hover { border-color: var(--accent); }
  .card-header {
    display: flex; justify-content: space-between;
    align-items: flex-start; gap: 12px; margin-bottom: 6px;
  }
  .card-title { font-size: 1.05em; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .card-title .slug { font-weight: 400; font-size: 0.85em; color: var(--muted); }
  .card-desc {
    font-size: 0.9em; color: var(--muted); margin-bottom: 10px; line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .card-meta { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; font-size: 0.82em; color: var(--muted); }
  .card-meta .stat { display: flex; align-items: center; gap: 4px; }
  .card-meta .stat .num { color: var(--fg); font-weight: 500; }
  .card-meta .tag { padding: 1px 6px; border-radius: 3px; background: var(--badge-bg); color: var(--badge-fg); font-size: 0.9em; }
  .card-actions button {
    padding: 5px 16px; background: var(--btn-bg); color: var(--btn-fg);
    border: none; border-radius: 5px; cursor: pointer; font-size: 0.9em; white-space: nowrap;
  }
  .card-actions button:hover { opacity: 0.9; }
  .card-actions button.installed { opacity: 0.5; cursor: default; background: var(--success); }

  .status { text-align: center; padding: 40px 20px; color: var(--muted); font-size: 0.95em; }
  .status .hint { font-size: 0.85em; margin-top: 8px; }
</style>
</head>
<body>
  <h1>${escHtml(t("search.title"))}</h1>
  <div class="source-row">
    <div id="sourceBadge" class="source-badge"></div>
    <button id="switchSourceBtn" class="switch-btn"></button>
  </div>
  <div id="categories" class="categories"></div>
  <div id="activeFilter" class="active-filter"></div>

  <div class="search-bar">
    <input id="q" type="text"
           placeholder="${escHtml(t("search.placeholder"))}"
           autofocus />
    <button id="searchBtn">${escHtml(t("common.search"))}</button>
  </div>
  <div id="results">
    <div class="status">
      ${escHtml(t("search.hint"))}
      <div class="hint">${escHtml(t("search.hintSub"))}</div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const i18n = ${i18nData};
    const q = document.getElementById('q');
    const resultsDiv = document.getElementById('results');
    const categoriesDiv = document.getElementById('categories');
    const activeFilterDiv = document.getElementById('activeFilter');
    const switchBtn = document.getElementById('switchSourceBtn');
    switchBtn.textContent = i18n.switchSource;
    let currentCat = null;
    let cats = [];

    document.getElementById('searchBtn').addEventListener('click', doSearch);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    switchBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'switchSource' });
    });

    function doSearch() {
      const query = q.value.trim();
      if (!query) return;
      clearCatSelection();
      vscode.postMessage({ type: 'search', query });
    }

    function selectCat(key) {
      currentCat = key;
      updateCatButtons();
      const cat = cats.find(c => c.key === key);
      activeFilterDiv.className = 'active-filter visible';
      activeFilterDiv.innerHTML = i18n.filter + ': <span class="filter-tag">'
        + esc(cat ? cat.name : key)
        + ' <span class="close" onclick="clearCatSelection()">\\u00d7</span></span>';
      vscode.postMessage({ type: 'category', key });
    }

    function clearCatSelection() {
      currentCat = null;
      updateCatButtons();
      activeFilterDiv.className = 'active-filter';
      activeFilterDiv.innerHTML = '';
    }

    function updateCatButtons() {
      categoriesDiv.querySelectorAll('.cat-btn').forEach(btn => {
        btn.className = 'cat-btn' + (btn.dataset.key === currentCat ? ' active' : '');
      });
    }

    function fmtNum(n) {
      if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return String(n);
    }

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'sourceChanged') {
        const badge = document.getElementById('sourceBadge');
        badge.innerHTML = '<span class="dot"></span>' + esc(msg.label);
      } else if (msg.type === 'categories') {
        cats = msg.categories || [];
        categoriesDiv.innerHTML = cats.map(c =>
          '<button class="cat-btn" data-key="' + esc(c.key) + '">' + esc(c.name) + '</button>'
        ).join('');
        categoriesDiv.querySelectorAll('.cat-btn').forEach(btn => {
          btn.addEventListener('click', () => selectCat(btn.dataset.key));
        });
      } else if (msg.type === 'loading') {
        resultsDiv.innerHTML = '<div class="status">' + esc(i18n.loading) + '</div>';
      } else if (msg.type === 'results') {
        const installed = new Set(msg.installed || []);
        if (!msg.results.length) {
          resultsDiv.innerHTML = '<div class="status">' + esc(i18n.noResults) + '</div>';
          return;
        }
        resultsDiv.innerHTML = msg.results.map(r => {
          const isInstalled = installed.has(r.slug);
          const stats = [];
          if (r.downloads > 0) stats.push('<span class="stat">\\u2b07 <span class="num">' + fmtNum(r.downloads) + '</span> ' + esc(i18n.downloads) + '</span>');
          if (r.installs > 0) stats.push('<span class="stat">\\ud83d\\udce6 <span class="num">' + fmtNum(r.installs) + '</span> ' + esc(i18n.installs) + '</span>');
          if (r.stars > 0) stats.push('<span class="stat">\\u2b50 <span class="num">' + fmtNum(r.stars) + '</span></span>');
          if (r.version) stats.push('<span class="tag">v' + esc(r.version) + '</span>');
          if (r.owner) stats.push('<span class="stat">' + esc(i18n.author) + ': ' + esc(r.owner) + '</span>');

          return '<div class="card">' +
            '<div class="card-header">' +
              '<div class="card-title">' + esc(r.name) +
                ' <span class="slug">' + esc(r.slug) + '</span></div>' +
              '<div class="card-actions">' +
                (isInstalled
                  ? '<button class="installed" disabled>\\u2713 ' + esc(i18n.installed) + '</button>'
                  : '<button data-slug="' + esc(r.slug) + '">' + esc(i18n.install) + '</button>') +
              '</div>' +
            '</div>' +
            '<div class="card-desc">' + esc(r.description) + '</div>' +
            '<div class="card-meta">' + stats.join('') + '</div>' +
          '</div>';
        }).join('');
        resultsDiv.querySelectorAll('button[data-slug]').forEach(btn => {
          btn.addEventListener('click', () => installSkill(btn));
        });
      } else if (msg.type === 'error') {
        resultsDiv.innerHTML = '<div class="status">' + esc(i18n.error) + ': ' + esc(msg.message) + '</div>';
      } else if (msg.type === 'installComplete') {
        const btn = resultsDiv.querySelector('button[data-slug="' + CSS.escape(msg.slug) + '"]');
        if (btn) { btn.textContent = '\\u2713 ' + i18n.installed; btn.className = 'installed'; btn.disabled = true; }
      } else if (msg.type === 'installError') {
        const btn = resultsDiv.querySelector('button[data-slug="' + CSS.escape(msg.slug) + '"]');
        if (btn) { btn.textContent = i18n.install; btn.disabled = false; }
      }
    });

    function installSkill(btn) {
      const slug = btn.dataset.slug;
      btn.textContent = i18n.installing;
      btn.disabled = true;
      vscode.postMessage({ type: 'install', slug });
    }

    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }
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
