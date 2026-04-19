# MetisNote

MetisNote 是一个**本地优先（local-first）**的桌面笔记应用，基于 **Electron + React + TipTap** 构建，面向本地知识管理、结构化写作和 AI 辅助编辑场景。

项目当前已经具备完整的本地笔记工作流，包括文档树、富文本编辑、双向链接、资源附件、版本历史、模板、AI 帮写、模型管理、暗色模式、专注模式和 PDF/打印导出。

## 核心能力

### 1. 本地优先的文档管理

- 所有笔记、资源、模板、版本历史都存储在本地文件系统
- 支持**无限层级**的文档树，树上的每个节点都是一篇真实文档
- 支持左侧 tab 视图切换：**全部 / 收藏 / 回收站**
- 支持文档搜索、置顶、复制、移动到回收站、恢复、永久删除
- 支持标签管理
- 支持在当前文档下新建子文档，适合构建层级化知识库

### 2. 全功能本地编辑器

编辑器基于 TipTap，已支持：

- 标题、段落、粗体、斜体、下划线、删除线
- 无序列表、有序列表、任务列表
- 多色高亮、文本对齐
- 引用、分割线
- 表格
- 语法高亮代码块
- 折叠详情块（Details）
- 数学公式 / 数学块
- 上标 / 下标
- Typography 增强
- 目录（TOC）
- 拖拽句柄

同时支持：

- 编辑 / 预览模式切换
- Markdown 导入与导出
- 富文本与 Markdown 的主要结构 round-trip
- 文档内容自动保存

### 3. 图片、附件与资源管理

- 支持插入图片
- 支持插入文件附件
- 支持资源导入、预览、替换、打开
- 支持粘贴 / 拖拽导入资源
- 资源通过本地资产存储统一管理
- Markdown 导入导出时可处理资源引用

### 4. 双向链接与知识关联

- 支持使用 `[[` 插入其他文档链接
- 支持 slash 命令插入文档链接
- 支持文档链接节点渲染与跳转
- 支持反向链接（Backlinks）面板
- 删除或失效链接会有对应状态反馈

### 5. AI 帮写

- 支持通过 `/` 命令唤起 AI 帮写
- 支持通过工具栏入口唤起 AI 帮写
- AI 上下文仅使用**光标前**的内容
- 支持流式生成
- 支持预览、确认插入、取消、重试
- 适合续写、扩写、润色等编辑内协作场景

### 6. 模型与智能设置

设置页已支持统一管理不同来源的模型：

- 内置模型配置
- 自定义 **OpenAI-compatible** 模型
- 自定义 **Anthropic** 模型
- 本地模型（通过 **node-llama-cpp** 在 Electron 主进程运行）

当前支持：

- 模型新增、编辑、删除、启用
- 本地模型下载与运行状态管理
- 统一模型列表管理
- 选择当前启用模型供 AI 功能调用

### 7. 版本历史与模板

- 自动保存文档版本快照
- 支持查看版本历史
- 支持恢复到历史版本
- 支持内置模板与自定义模板
- 支持将当前文档保存为模板
- 支持从模板创建新文档
- 设置页可管理模板

### 8. 主题、专注与导出

- 支持**跟随系统 / 亮色 / 暗色**主题切换
- 支持**专注模式**，减少侧边栏和辅助信息干扰
- 支持打印
- 支持导出 PDF
- 支持导出 Markdown

### 9. 快捷键与多语言

当前已支持常用快捷键：

- `Cmd/Ctrl + N`：新建文档
- `Cmd/Ctrl + F`：聚焦搜索
- `Cmd/Ctrl + S`：立即保存
- `Cmd/Ctrl + Shift + F`：切换专注模式
- `Cmd/Ctrl + P`：导出 PDF
- `Esc`：退出专注模式 / 关闭部分编辑器浮层

语言支持：

- 简体中文
- English

渲染层与 Electron 主进程共用 `src/shared/i18n.ts` 字典，并根据系统 / 浏览器语言自动选择。

## 技术栈

- Electron
- React 18
- TypeScript
- TipTap
- Tailwind CSS
- shadcn 风格 UI 组件
- node-llama-cpp

## 快速开始

```bash
npm install
npm run dev
```

## 常用命令

```bash
# 构建前后端资源
npm run build

# TypeScript 检查
npm run typecheck

# 打包 macOS App
npm run package:mac

# 打包 Windows App（需在 Windows 环境执行）
npm run package:win
```

## 构建产物

执行 `npm run package:mac` 后会生成：

- `release/MetisNote-darwin-arm64/MetisNote.app`
- `release/MetisNote-darwin-arm64.zip`

GitHub Actions 在 tag 构建时会自动生成并上传以下 Release 下载文件：

- `MetisNote-macOS-installer-<tag>.zip`（包含 macOS `.app` 安装包目录）
- `MetisNote-Windows-installer-<tag>.zip`（包含 Windows `.exe + resources` 安装包目录）

## 重新推送构建 tag

```bash
# 示例：重新发布 v0.1.0
git tag -d v0.1.0
git push origin :refs/tags/v0.1.0

git tag v0.1.0
git push origin v0.1.0
```

如果不想覆盖原 tag，可以直接创建新 tag（推荐）：

```bash
git tag v0.1.1
git push origin v0.1.1
```

## 项目结构

- `electron/main`：主进程、本地数据服务、模型运行时、IPC 注册
- `electron/preload`：安全 IPC 桥接
- `src`：React 渲染层、编辑器、设置页、共享 UI
- `docs`：实现说明与设计文档
- `design`：交互和功能设计稿

## 适用场景

MetisNote 适合以下场景：

- 本地知识库整理
- 层级化笔记与研究记录
- 需要双向链接的个人 wiki
- 带 AI 帮写能力的长文写作
- 希望在本地管理模型与文档数据的桌面写作工具
