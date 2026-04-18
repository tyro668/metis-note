# MetisNote 实现方案

## 1. 产品目标

构建一个本地优先、启动快、离线可用的桌面笔记软件。第一阶段优先打通“打开应用即可开始记笔记”的主链路，重点关注稳定性、自动保存和可扩展的数据结构。

## 2. 当前版本范围

### 核心功能

- 本地笔记列表展示
- 新建笔记、复制笔记
- 软删除、回收站恢复、彻底删除
- 笔记标题编辑
- 标签编辑
- 笔记置顶
- TipTap 富文本正文编辑
- 自动保存
- 视图筛选与基础搜索
- Markdown 导入导出

### 当前暂不实现

- 多笔记本
- 图片拖拽上传
- 云同步
- 命令面板
- 历史版本

## 3. 技术架构

### 进程职责

- Electron Main
  - 创建窗口
  - 注册 IPC
  - 调用 Node.js 本地存储服务
- Preload
  - 通过 `contextBridge` 暴露受控 API
- Renderer
  - React 管理界面与编辑器交互
  - Tailwind + shadcn 风格组件构建 UI
  - TipTap 提供富文本能力

### 数据存储

当前版本使用文件系统而不是数据库，原因是：

- 本地优先应用实现简单，便于调试
- 文件结构直观，便于后续迁移
- 足够支撑 MVP

推荐结构：

```text
userData/metis-note-store/
  index.json
  items/
    {noteId}.json
```

- `index.json` 保存笔记列表元数据和状态字段
- 每篇笔记正文单独保存为 JSON，内容格式与 TipTap 文档结构一致

## 4. 数据模型

### NoteSummary

- `id`
- `title`
- `preview`
- `plainText`
- `createdAt`
- `updatedAt`
- `wordCount`
- `isPinned`
- `status`
- `tags`

### NoteDocument

- 继承 `NoteSummary`
- `content`

## 5. 前端页面结构

### 左侧面板

- 应用品牌区
- 新建与导入按钮
- 全部 / 置顶 / 最近 / 回收站视图
- 搜索框
- 标签筛选区
- 笔记列表

### 右侧主区域

- 当前笔记标题
- 标签输入
- 保存状态
- 元信息与快捷操作
- 富文本工具栏
- TipTap 编辑区

## 6. 关键交互策略

- 首次启动自动创建欢迎笔记，避免空白页
- 编辑正文或标题后自动保存
- 切换笔记前先冲刷未完成保存，减少内容丢失
- 将最后一篇活跃笔记移入回收站或彻底删除后，自动补一篇空白笔记，保持可用状态
- 回收站中的笔记以只读方式展示，恢复后继续编辑
- 通过本地文件对话框完成 Markdown 导入导出

## 7. 模块拆分

### Electron / Node

- `electron/main/index.ts`
  - 窗口生命周期
- `electron/main/ipc/notes.ts`
  - IPC 注册
- `electron/main/services/note-store.ts`
  - 文件存储、迁移、状态流转
- `electron/main/services/note-markdown.ts`
  - Markdown 导入导出转换

### Renderer

- `src/App.tsx`
  - 全局状态与交互编排
- `src/components/note-list.tsx`
  - 列表与搜索
- `src/components/note-editor.tsx`
  - 标题、工具栏、编辑器
- `src/components/ui/*`
  - shadcn 风格基础组件

## 8. 后续扩展路线

### 下一阶段

- SQLite 持久化
- 全文搜索索引
- 多窗口与命令面板
- 同步和冲突解决
