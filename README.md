[English](#english) | [中文](#中文)

---

<a id="english"></a>

# AISkills Manager

> 🚀 **Discover, install, and manage AI skills** for Claude, GitHub Copilot, OpenClaw, and VS Code Agent — all from within VS Code.

[![VS Code](https://img.shields.io/badge/VS%20Code-^1.85-blue?logo=visualstudiocode)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.md)

## ✨ Features

- 🔍 **Skill Discovery** — Browse and search 34,000+ AI skills from dual sources
- 📦 **One-Click Install** — Install, uninstall, and upgrade skills with a single click
- 🌏 **Dual Source** — Switch between **China Source (SkillHub)** and **Global Source (ClawHub)**
- 📂 **Multi-Target Deploy** — Deploy skills to Claude, GitHub Copilot, OpenClaw, or VS Code Agent directories
- 🔄 **Drag & Drop** — Move skills between deploy targets via drag-and-drop
- 🌐 **Bilingual UI** — English and Chinese (中文), auto-detected from OS language
- ⬆️ **Batch Upgrade** — Check and upgrade all installed skills at once

## 📸 Quick Start

1. Open the **AI Skills** panel from the Activity Bar (sidebar icon)
2. Click the 🔍 **Search** button to discover skills
3. Browse by category or search by keyword
4. Click **Install** on any skill card
5. Use the ⚙️ **Control Panel** to configure sources, deploy targets, and language

## 🌏 Data Sources

| Source | Region | Provider | Skills |
|--------|--------|----------|--------|
| 🇨🇳 **SkillHub** | China | lightmake.site + Tencent COS CDN | Curated |
| 🌐 **ClawHub** | Global | clawhub.ai | 34,000+ |

Switch sources anytime from the **Control Panel** or directly in the **Search Panel**.

### ⚠️ Global Source Rate Limit

The global source (ClawHub) enforces anonymous rate limits (~180 requests/min). If you make many requests in a short time, you may see **HTTP 429 (Too Many Requests)** errors. This is normal — simply wait a moment and retry. Consider switching to the China source if you experience frequent 429 errors.

## 📂 Deploy Targets

| Target | Directory | Platform |
|--------|-----------|----------|
| **Claude / GitHub** | `~/.claude/skills` | VS Code Copilot (Claude), GitHub Copilot |
| **OpenClaw** | `~/.openclaw/workspace/skills` | OpenClaw / 龙虾 |
| **Agent** | `~/.agents/skills` | VS Code Agent |

## ⚙️ Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `skillhub.language` | `auto` / `zh` / `en` | `auto` | UI language (auto = follow OS) |
| `skillhub.source` | `china` / `global` | `china` | Data source |
| `skillhub.targetClaude` | boolean | `true` | Deploy to Claude / GitHub directory |
| `skillhub.targetOpenclaw` | boolean | `false` | Deploy to OpenClaw directory |
| `skillhub.targetAgent` | boolean | `false` | Deploy to Agent directory |
| `skillhub.endpointOverride` | string | `""` | Override search API URL |

## 🛠️ Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type `AI Skills`:

- **AI Skills: Search** — Open the skill discovery panel
- **AI Skills: Install** — Install a skill by slug
- **AI Skills: Uninstall** — Remove an installed skill
- **AI Skills: Check Updates** — Check and upgrade all skills
- **AI Skills: Refresh** — Refresh the installed skills list
- **AI Skills: Control Panel** — Open settings panel

## 📄 License

[MIT](LICENSE.md)

[English](#english) | [中文](#中文)

---

<a id="中文"></a>

# AISkills Manager（中文说明）

> 🚀 在 VS Code 中一站式发现、安装和管理 AI Skill，支持 Claude、GitHub Copilot、OpenClaw、VS Code Agent。

## ✨ 核心功能

- 🔍 **Skill 发现** — 浏览和搜索 34,000+ AI Skill
- 📦 **一键安装** — 安装、卸载、升级全部一键搞定
- 🌏 **双数据源** — 国内源 (SkillHub) 和国际源 (ClawHub) 自由切换
- 📂 **多目标部署** — 同时部署到 Claude、GitHub Copilot、OpenClaw、VS Code Agent
- 🔄 **拖拽移动** — 在不同部署位置之间拖拽移动 Skill
- 🌐 **中英双语** — 自动跟随操作系统语言，也可手动切换
- ⬆️ **批量升级** — 一键检查并升级所有已安装 Skill

## 🚀 快速开始

1. 在侧边栏点击 **AI Skills** 图标
2. 点击 🔍 按钮打开"发现 Skill"面板
3. 选择分类浏览或搜索关键词
4. 点击 Skill 卡片上的**安装**按钮
5. 在 ⚙️ **控制面板**中配置数据源、部署位置和语言

## ⚠️ 国际源 429 限流说明

国际源 (ClawHub) 对匿名请求有频率限制（约 180 次/分钟）。如果短时间内请求过多，可能会遇到 **HTTP 429 (Too Many Requests)** 错误。这是正常现象，等待片刻后重试即可。如果频繁遇到 429，建议切换到国内源。

[English](#english) | [中文](#中文)
