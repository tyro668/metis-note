# MetisNote

一个本地优先的桌面笔记应用，技术栈为 Electron + Node.js + React + Tailwind + shadcn 风格组件 + TipTap。

## 当前实现

- Electron 主进程通过 IPC 暴露本地笔记服务
- Node.js 使用文件系统存储笔记元数据和正文内容
- React 渲染端提供三栏树形笔记工作区
- TipTap 提供富文本编辑体验
- 已支持标签、置顶、回收站、复制、Markdown 导入导出
- 已支持应用设置页中的智能设置，可管理内置模型、自定义 OpenAI / Anthropic 协议模型，以及通过 llama.cpp 接入本地大模型
- 已支持快捷键 `Cmd/Ctrl + N`、`Cmd/Ctrl + F`、`Cmd/Ctrl + S`
- 已支持简体中文 / English，渲染层与 Electron 主进程共用 `src/shared/i18n.ts` 字典，并根据系统 / 浏览器语言自动选择

## 快速开始

```bash
npm install
npm run dev
```

## 构建可运行 App

```bash
npm run package:mac
```

构建完成后会生成：

- `release/MetisNote-darwin-arm64/MetisNote.app`
- `release/MetisNote-darwin-arm64.zip`

## 架构说明

- [实现方案](./docs/implementation-plan.md)
- `electron/main`: 主进程和本地数据服务
- `electron/preload`: 安全 IPC 桥
- `src`: React 渲染层、UI 组件和共享类型

## 当前桌面工作流

- 在左侧通过 tab 分类切换全部、收藏和回收站
- 在中间文档树中浏览无限层级嵌套文档，在右侧预览或编辑正文内容
- 通过搜索、置顶和树形结构快速定位笔记
- 删除笔记时先进入回收站，支持恢复和彻底删除
- 可从本地导入 `.md` / `.txt`，也可将当前笔记导出为 Markdown
- 通过设置页管理多个 LLM 模型配置，支持内置模型目录、OpenAI / Anthropic 协议自定义模型和 llama.cpp 本地模型，并启用一个当前模型用于后续 AI 功能

## 后续建议

- 增加图片拖拽与粘贴
- 增加命令面板和更多快捷键
- 增加多笔记本与更强的筛选体系
- 将文件存储升级为 SQLite + FTS
