# Changelog

## 1.0.2

### New Features

- **Symlink / Junction support**: Skills that are symbolic links or NTFS junctions are now correctly detected and displayed with a 🔗 link icon
- **Symlink safety on delete**: Deleting a symlink only removes the link itself, not the actual directory; deleting a source directory warns if other symlinks point to it
- **No more deduplication**: Each directory shows its own skills independently — the same skill in Claude and Agent will appear in both groups, giving full visibility into what exists where

### Improvements

- Drag-and-drop now always refreshes the tree view, even when the move is skipped (e.g. target already exists)
- Tooltip for symlink skills shows the actual target path

### Bug Fixes

- Fixed: Skills stored as junctions (e.g. favicon-gen) were invisible because `fs.readdirSync` with `withFileTypes` does not follow reparse points — now handled via `isSymbolicLink()` + `fs.statSync` fallback

## 1.0.1

### Improvements

- Project local skills now display in a hierarchical tree by directory (e.g. `.agents/skills`, `.claude/skills`), making it easy to identify skills from different locations
- Added click behavior setting: choose between Markdown preview or direct editing when clicking a skill
- China source description updated to "由腾讯skillhub提供" / "Powered by Tencent Skillhub"
- Removed advanced settings section (endpoint override) to simplify the control panel

## 1.0.0

First stable release.

### Features

- Browse, search, install, uninstall, and upgrade AI skills directly from VS Code
- Sidebar TreeView showing all installed skills, grouped by target platform (Claude / GitHub Copilot, OpenClaw, Agent)
- WebView-based search panel with keyword search and one-click install
- Dual data source: China (SkillHub) and Global (ClawHub), switchable in settings or via the search panel
- Full bilingual UI (English / Chinese), auto-detected from OS locale or manually configured via `skillhub.language`
- All command titles, setting descriptions, and view labels localized through `package.nls.json`
- Settings panel with data source selector, deployment target toggles, language selector, and custom endpoint override
- Batch upgrade for all installed skills
