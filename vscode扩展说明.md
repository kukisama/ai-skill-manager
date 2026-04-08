# VS Code 扩展打包与发布指南

## 前置条件

```bash
npm install -g @vscode/vsce
```

## 打包流程

```bash
# 1. 进入扩展目录
cd Docs/cli/vscodeextend

# 2. 编译 TypeScript（src/ → out/）
npm run compile

# 3. 打包为 .vsix
npx @vscode/vsce package
# 输出：ai-skill-manager-{version}.vsix
```

打包完成后可通过两种方式安装验证：
- **本地安装**：VS Code → 扩展 → `···` → 从 VSIX 安装
- **命令行**：`code --install-extension ai-skill-manager-1.0.0.vsix`

## 发布到 Marketplace

### 方式一：网页上传（推荐首次使用）

1. 打开 https://marketplace.visualstudio.com/manage
2. 选择 Publisher **Kukisama Team (KukisamaTeam)**
3. 点击 **+ New extension → Visual Studio Code**
4. 拖入 `.vsix` 文件，点 Upload
5. 几分钟后即可在市场搜到

### 方式二：命令行发布

```bash
# 首次登录（需要 Azure DevOps PAT，Scope: Marketplace > Manage）
npx @vscode/vsce login KukisamaTeam

# 发布
npx @vscode/vsce publish
```

## 版本更新

### 1. 手动改版本号

编辑 `package.json` 中的 `version` 字段：

```json
"version": "1.1.0"
```

然后重新打包发布。

### 2. 用 vsce 自动升版

```bash
# patch: 1.0.0 → 1.0.1（修 bug）
npx @vscode/vsce package patch

# minor: 1.0.0 → 1.1.0（加功能）
npx @vscode/vsce package minor

# major: 1.0.0 → 2.0.0（大改版）
npx @vscode/vsce package major
```

这会自动修改 `package.json` 里的版本号并打包。

如果用命令行发布，也可以直接：

```bash
npx @vscode/vsce publish minor   # 自动升版 + 发布一步到位
```

### 3. 网页更新

在 https://marketplace.visualstudio.com/manage 找到已发布的扩展，点击 `···` → **Update**，上传新版 `.vsix` 即可。

## 版本号规范（SemVer）

| 场景 | 升级类型 | 示例 |
|------|---------|------|
| 修复 bug、文案调整 | patch | 1.0.0 → 1.0.1 |
| 新增功能、新增数据源 | minor | 1.0.0 → 1.1.0 |
| 不兼容的大改、重构 | major | 1.0.0 → 2.0.0 |

## CHANGELOG 更新

每次发版前更新 `CHANGELOG.md`：

```markdown
## [1.1.0] - 2026-03-24
### Added
- xxx 功能
### Fixed
- 修复 xxx 问题
```

## 关键文件说明

| 文件 | 作用 |
|------|------|
| `package.json` | 扩展清单（名称、版本、命令、配置项） |
| `package.nls.json` | 英文本地化字符串 |
| `package.nls.zh-cn.json` | 中文本地化字符串 |
| `.vscodeignore` | 打包时排除的文件（类似 .gitignore） |
| `src/` | TypeScript 源码 |
| `out/` | 编译产物（打包会包含） |
| `media/` | 图标等静态资源 |

## 注意事项

- `publisher` 字段必须与 Marketplace 上注册的 Publisher ID 完全一致（当前为 `KukisamaTeam`）
- 每次发布的 `version` 必须比上一次高，否则上传会被拒绝
- `.vscodeignore` 已配置排除 `src/`、`node_modules/` 等，打包体积较小
- 发布无人工审核，上传成功后几分钟即上架
