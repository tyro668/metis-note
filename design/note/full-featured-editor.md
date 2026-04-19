# Metis Note 全功能编辑器设计方案

**目标**：基于 Tiptap 现有能力和 Electron 本地环境优势，将 Metis Note 打造为功能完善的本地笔记软件，实现 90+ 分的编辑体验。

---

## 1. 现状分析

### 1.1 已实现能力

| 类别 | 功能 |
| --- | --- |
| 文本格式 | H1-H3、粗体、斜体、删除线、行内代码、代码块、引用块 |
| 列表 | 无序列表、有序列表 |
| 块级元素 | 表格（4 个扩展）、水平分割线 |
| 链接 | 外部链接（自动识别、粘贴识别）、文档链接（noteLink 自定义节点） |
| AI | 斜杠命令 AI 续写、流式生成面板 |
| 组织 | 树形层级、标签、收藏、搜索、回收站 |
| 导入导出 | Markdown 双向转换 |
| 其他 | 占位符、拖拽光标、间隙光标、撤销/重做 |

### 1.2 关键缺失

| 优先级 | 缺失能力 | 用户影响 |
| --- | --- | --- |
| **P0** | 图片插入与存储 | 笔记无法包含图片，严重影响实用性 |
| **P0** | 附件嵌入与管理 | 无法在笔记中附加文件（PDF、文档等） |
| **P0** | 任务列表（checkbox） | 缺少最基本的待办功能 |
| **P1** | 代码块语法高亮 | 开发者用户的基本需求 |
| **P1** | 高亮标记 | 常用的阅读批注手段 |
| **P1** | 下划线 | 基础排版 |
| **P1** | 文本对齐 | 标题居中、正文左对齐等排版需求 |
| **P1** | 折叠块（Details） | 长文档信息组织 |
| **P2** | 目录生成 | 长文档导航 |
| **P2** | 数学公式 | 技术文档需求 |
| **P2** | 拖拽排序 | 块级内容重组 |
| **P2** | 上标/下标 | 科学写作 |
| **P2** | 版本历史 | 内容安全网 |
| **P3** | 模板系统 | 常用文档结构复用 |
| **P3** | 暗色模式 | 视觉偏好 |
| **P3** | 专注模式 | 沉浸写作 |
| **P3** | 打印/PDF 导出 | 输出交付 |

---

## 2. 总体架构

### 2.1 存储结构升级

当前：

```
<baseDir>/
  index.json
  links.json
  items/<uuid>.json
```

升级为：

```
<baseDir>/
  index.json                 ← 笔记索引（已有）
  links.json                 ← 引用索引（已有）
  templates.json             ← 模板索引（新增）
  versions/                  ← 版本历史（新增）
    <noteId>/
      <timestamp>.json
  items/
    <uuid>.json              ← 笔记内容（已有）
  assets/                    ← 附件存储（新增）
    <uuid>/                  ← 按笔记 ID 分目录
      <assetId>.<ext>        ← 图片、附件文件
```

### 2.2 资源引用模型

图片和附件在 JSONContent 中通过 `asset://` 协议引用：

```
asset://<noteId>/<assetId>.<ext>
```

Electron 主进程注册自定义协议 `asset://`，拦截请求并从本地文件系统返回文件内容。这样：

- 编辑器中的 `<img src="asset://...">` 可以直接渲染。
- 不暴露用户文件系统的真实路径。
- 笔记导出时可以将资源一起打包。

### 2.3 自定义协议注册

```typescript
// electron/main/index.ts
import { protocol } from "electron"

protocol.handle("asset", (request) => {
  // asset://<noteId>/<assetId>.<ext>
  const url = new URL(request.url)
  const [noteId, filename] = url.pathname.split("/").filter(Boolean)
  const filePath = path.join(baseDir, "assets", noteId, filename)
  return net.fetch(`file://${filePath}`)
})
```

在 `app.whenReady()` 之前调用 `protocol.registerSchemesAsPrivileged`：

```typescript
protocol.registerSchemesAsPrivileged([
  {
    scheme: "asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
])
```

---

## 3. 图片功能设计（P0）

### 3.1 Tiptap 扩展

使用官方 `@tiptap/extension-image`，配置为 block 节点：

```typescript
import Image from "@tiptap/extension-image"

Image.configure({
  inline: false,
  allowBase64: false, // 禁止 base64，所有图片走 asset:// 协议
  HTMLAttributes: {
    class: "note-image",
  },
})
```

### 3.2 节点结构

```json
{
  "type": "image",
  "attrs": {
    "src": "asset://a1b2c3d4/img_001.png",
    "alt": "架构图",
    "title": "系统架构图",
    "width": 600,
    "height": null
  }
}
```

### 3.3 图片插入方式

| 方式 | 触发 | 流程 |
| --- | --- | --- |
| 工具栏按钮 | 点击图片图标 | 打开系统文件选择对话框 → 选择图片 → 复制到 assets 目录 → 插入节点 |
| 斜杠命令 | `/image` 或 `/图片` | 同上 |
| 粘贴图片 | `⌘V` 粘贴剪贴板图片 | 读取剪贴板图片数据 → 保存到 assets 目录 → 插入节点 |
| 拖拽图片 | 从 Finder 拖入 | 读取拖入文件 → 复制到 assets 目录 → 插入节点 |
| 粘贴图片文件 | `⌘V` 粘贴文件 | 同拖拽流程 |

### 3.4 支持格式

`png`、`jpg`/`jpeg`、`gif`、`webp`、`svg`、`bmp`、`ico`。

单张图片大小限制：**20MB**。

### 3.5 图片处理流程

```
用户触发图片插入
  → IPC: assets:importImage(noteId, sourcePath | buffer, filename)
  → 主进程：
    1. 生成 assetId（nanoid, 12 位）
    2. 确保 assets/<noteId>/ 目录存在
    3. 复制/写入文件到 assets/<noteId>/<assetId>.<ext>
    4. 返回 { assetId, src: "asset://<noteId>/<assetId>.<ext>", width, height }
  → 渲染进程：
    1. 在光标位置插入 image 节点，src 设为返回的 asset:// URL
    2. 触发文档自动保存
```

### 3.6 图片节点交互

**预览模式：**
- 图片按原始宽度显示，最大不超过编辑器内容区宽度。
- 点击图片弹出灯箱（lightbox），支持放大查看。

**编辑模式：**
- 选中图片时显示操作浮层：
  - 拖拽手柄（四角）调整尺寸。
  - 对齐方式：左对齐 / 居中 / 右对齐。
  - 替换图片。
  - 删除图片。
  - 添加/编辑 alt 文本。
- 图片下方可选显示标题（caption）。

### 3.7 图片灯箱（Lightbox）

点击图片后弹出全屏灯箱：

- 半透明黑色背景遮罩。
- 图片居中显示，按比例放大到屏幕尺寸。
- 支持滚轮缩放、拖拽平移。
- `Escape` 或点击背景关闭。
- 显示 alt 文本 / 标题（如有）。

### 3.8 粘贴与拖拽处理

使用 Tiptap 的 `handlePaste` 和 `handleDrop` 钩子：

```typescript
// 在编辑器 editorProps 中配置
editorProps: {
  handlePaste(view, event, slice) {
    const files = Array.from(event.clipboardData?.files || [])
    const images = files.filter(f => f.type.startsWith("image/"))
    if (images.length > 0) {
      // 异步处理：每张图片调用 assets:importImage
      handleImageFiles(images, view)
      return true
    }
    return false
  },
  handleDrop(view, event, slice, moved) {
    if (moved) return false
    const files = Array.from(event.dataTransfer?.files || [])
    const images = files.filter(f => f.type.startsWith("image/"))
    if (images.length > 0) {
      handleImageFiles(images, view)
      return true
    }
    return false
  },
}
```

---

## 4. 附件功能设计（P0）

### 4.1 自定义节点：fileAttachment

新增 Tiptap 自定义 block 节点 `fileAttachment`：

```typescript
{
  type: "fileAttachment",
  attrs: {
    assetId: string,            // 资源 ID
    noteId: string,             // 所属笔记 ID
    src: string,                // "asset://<noteId>/<assetId>.<ext>"
    filename: string,           // 原始文件名
    filesize: number,           // 文件大小（字节）
    mimetype: string,           // MIME 类型
  }
}
```

### 4.2 附件插入方式

| 方式 | 触发 |
| --- | --- |
| 工具栏按钮 | 点击附件图标 |
| 斜杠命令 | `/file` 或 `/附件` |
| 拖拽文件 | 从 Finder 拖入非图片文件 |
| 粘贴文件 | 粘贴非图片文件 |

### 4.3 附件渲染

附件以卡片样式渲染为独立块：

```
┌─────────────────────────────────────────────────┐
│  📎  项目需求文档.pdf                    2.3 MB  │
│       PDF 文档 · 点击打开                        │
└─────────────────────────────────────────────────┘
```

- 左侧：根据文件类型显示对应图标（📎 PDF、📊 Excel、📝 Word、📦 ZIP、📁 通用）。
- 中间：文件名 + 文件类型描述。
- 右侧：文件大小（格式化显示）。
- 点击：调用系统默认应用打开文件。
- 编辑模式下右上角显示删除按钮。

### 4.4 文件类型限制

- 单个附件大小限制：**50MB**。
- 单篇笔记附件总大小限制：**200MB**。
- 不限制文件类型（但可选安全警告弹窗对可执行文件 `.exe`/`.app`/`.sh` 等）。

### 4.5 附件处理流程

```
用户选择/拖入文件
  → IPC: assets:importFile(noteId, sourcePath, originalFilename)
  → 主进程：
    1. 校验文件大小
    2. 生成 assetId
    3. 复制文件到 assets/<noteId>/<assetId>.<ext>
    4. 返回 { assetId, src, filename, filesize, mimetype }
  → 渲染进程：
    1. 插入 fileAttachment 节点
    2. 触发自动保存
```

### 4.6 附件打开

```
用户点击附件卡片
  → IPC: assets:openFile(noteId, assetId, filename)
  → 主进程：
    1. 构建文件完整路径
    2. shell.openPath(filePath)  ← Electron API，用系统默认应用打开
```

---

## 5. 资源管理 IPC 设计

### 5.1 IPC 通道

| 通道 | 方向 | 参数 | 返回 | 用途 |
| --- | --- | --- | --- | --- |
| `assets:importImage` | renderer → main | `{ noteId, source: string \| Buffer, filename }` | `ImageAssetResult` | 导入图片到资源目录 |
| `assets:importFile` | renderer → main | `{ noteId, sourcePath, originalFilename }` | `FileAssetResult` | 导入附件到资源目录 |
| `assets:pickAndImportImage` | renderer → main | `{ noteId }` | `ImageAssetResult \| null` | 弹出文件选择对话框并导入图片 |
| `assets:pickAndImportFile` | renderer → main | `{ noteId }` | `FileAssetResult \| null` | 弹出文件选择对话框并导入附件 |
| `assets:openFile` | renderer → main | `{ noteId, assetId, ext }` | `void` | 用系统默认应用打开附件 |
| `assets:delete` | renderer → main | `{ noteId, assetId, ext }` | `void` | 删除单个资源文件 |
| `assets:getImageDimensions` | renderer → main | `{ filePath }` | `{ width, height }` | 获取图片尺寸 |

### 5.2 Preload 桥接

```typescript
window.metisNote.assets = {
  importImage(params) => Promise<ImageAssetResult>,
  importFile(params) => Promise<FileAssetResult>,
  pickAndImportImage(params) => Promise<ImageAssetResult | null>,
  pickAndImportFile(params) => Promise<FileAssetResult | null>,
  openFile(params) => Promise<void>,
  delete(params) => Promise<void>,
  getImageDimensions(params) => Promise<{ width: number; height: number }>,
}
```

### 5.3 类型定义

```typescript
interface ImageAssetResult {
  assetId: string
  src: string          // "asset://<noteId>/<assetId>.<ext>"
  width: number
  height: number
  filesize: number
}

interface FileAssetResult {
  assetId: string
  src: string
  filename: string
  filesize: number
  mimetype: string
}
```

### 5.4 资源清理策略

| 场景 | 策略 |
| --- | --- |
| 笔记永久删除 | 删除 `assets/<noteId>/` 整个目录 |
| 笔记移入回收站 | 不清理资源（可恢复） |
| 编辑时删除图片/附件节点 | **不立即清理**文件，保存时做差异比对，清理不再被引用的资源 |
| 应用启动 | 可选的后台扫描：检查 assets 目录中是否有孤立资源 |

**保存时资源清理逻辑：**

```typescript
// 文档保存时
function cleanOrphanedAssets(noteId: string, content: JSONContent) {
  const referencedAssets = extractReferencedAssetIds(content) // 扫描所有 image 和 fileAttachment 节点
  const diskAssets = listAssetsOnDisk(noteId)                 // 列出 assets/<noteId>/ 目录文件
  for (const diskAsset of diskAssets) {
    if (!referencedAssets.has(diskAsset.assetId)) {
      fs.unlinkSync(diskAsset.path)  // 删除不再引用的文件
    }
  }
}
```

---

## 6. 任务列表设计（P0）

### 6.1 Tiptap 扩展

```typescript
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"

TaskList.configure({
  HTMLAttributes: { class: "task-list" },
})

TaskItem.configure({
  nested: true,  // 允许嵌套任务
  HTMLAttributes: { class: "task-item" },
})
```

### 6.2 节点结构

```json
{
  "type": "taskList",
  "content": [
    {
      "type": "taskItem",
      "attrs": { "checked": false },
      "content": [
        { "type": "paragraph", "content": [{ "type": "text", "text": "完成需求文档" }] }
      ]
    },
    {
      "type": "taskItem",
      "attrs": { "checked": true },
      "content": [
        { "type": "paragraph", "content": [{ "type": "text", "text": "技术评审" }] }
      ]
    }
  ]
}
```

### 6.3 交互

- **插入**：斜杠命令 `/task` 或 `/待办`，或工具栏按钮。
- **勾选**：预览模式和编辑模式下均可点击 checkbox 切换状态。
- **转换**：无序列表 ↔ 任务列表可互相切换。
- **嵌套**：`Tab` 缩进为子任务，`Shift+Tab` 取消缩进。
- **样式**：已完成项显示删除线 + 灰色文字。
- **快捷键**：`⌘+Shift+X` 切换任务列表。

### 6.4 CSS 样式

```css
.task-list {
  list-style: none;
  padding-left: 0;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.task-item > label {
  flex-shrink: 0;
  margin-top: 3px;
}

.task-item > label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  accent-color: var(--primary);
  cursor: pointer;
}

.task-item[data-checked="true"] > div > p {
  text-decoration: line-through;
  color: var(--muted-foreground);
}
```

---

## 7. 代码块语法高亮设计（P1）

### 7.1 依赖

```
@tiptap/extension-code-block-lowlight
lowlight
```

`lowlight` 基于 `highlight.js`，支持 190+ 种语言，按需加载。

### 7.2 配置

```typescript
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"
import { common, createLowlight } from "lowlight"

const lowlight = createLowlight(common)
// common 包含约 37 种常用语言：js, ts, python, java, c, cpp, go, rust, ruby, php, sql, json, yaml, xml, html, css, bash, markdown 等

CodeBlockLowlight.configure({
  lowlight,
  defaultLanguage: "plaintext",
  HTMLAttributes: { class: "code-block" },
})
```

注意：`CodeBlockLowlight` 替换 StarterKit 中内置的 `CodeBlock`，配置 StarterKit 时需 `codeBlock: false`。

### 7.3 语言选择器

代码块右上角显示语言选择下拉：

```
┌─────────────────────────────────────────────────┐
│ JavaScript ▾                            📋 Copy │
├─────────────────────────────────────────────────┤
│ function hello() {                              │
│   console.log("Hello, world!")                  │
│ }                                               │
└─────────────────────────────────────────────────┘
```

- 下拉菜单显示 lowlight 已注册的所有语言。
- 支持搜索过滤。
- 切换语言后立即重新高亮。
- 复制按钮：一键复制代码内容。

### 7.4 主题

使用 `highlight.js` 的 CSS 主题。亮色模式用 `github`，暗色模式用 `github-dark`。

---

## 8. 高亮标记设计（P1）

### 8.1 扩展配置

```typescript
import Highlight from "@tiptap/extension-highlight"

Highlight.configure({
  multicolor: true,
  HTMLAttributes: { class: "text-highlight" },
})
```

### 8.2 预设颜色

| 颜色名 | 色值 | 用途 |
| --- | --- | --- |
| 黄色 | `#fef08a` | 默认高亮 |
| 绿色 | `#bbf7d0` | 重要内容 |
| 蓝色 | `#bfdbfe` | 参考信息 |
| 粉色 | `#fbcfe8` | 个人备注 |
| 橙色 | `#fed7aa` | 待确认 |

### 8.3 交互

- **工具栏按钮**：点击高亮图标应用默认黄色高亮。长按或右键展开颜色选择。
- **快捷键**：`⌘+Shift+H` 切换默认高亮。
- **斜杠命令**：`/highlight` 或 `/高亮`。
- **取消**：选中已高亮文本再次点击同色按钮取消。

---

## 9. 下划线设计（P1）

```typescript
import Underline from "@tiptap/extension-underline"

Underline.configure({
  HTMLAttributes: { class: "text-underline" },
})
```

- **快捷键**：`⌘+U`。
- **工具栏按钮**：`U` 带下划线图标，位于斜体按钮之后。

---

## 10. 文本对齐设计（P1）

```typescript
import TextAlign from "@tiptap/extension-text-align"

TextAlign.configure({
  types: ["heading", "paragraph"],
  alignments: ["left", "center", "right"],
  defaultAlignment: "left",
})
```

- **工具栏**：对齐下拉按钮组（左对齐 / 居中 / 右对齐），位于列表按钮之后。
- **快捷键**：`⌘+Shift+L`（左）、`⌘+Shift+E`（中）、`⌘+Shift+R`（右）。

---

## 11. 折叠块设计（P1）

### 11.1 扩展配置

```typescript
import Details from "@tiptap/extension-details"
import DetailsContent from "@tiptap/extension-details-content"
import DetailsSummary from "@tiptap/extension-details-summary"

Details.configure({
  HTMLAttributes: { class: "note-details" },
})
DetailsSummary.configure({
  HTMLAttributes: { class: "note-details-summary" },
})
DetailsContent.configure({
  HTMLAttributes: { class: "note-details-content" },
})
```

### 11.2 节点结构

```json
{
  "type": "details",
  "content": [
    {
      "type": "detailsSummary",
      "content": [{ "type": "text", "text": "点击展开详情" }]
    },
    {
      "type": "detailsContent",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "这是折叠的详细内容..." }]
        }
      ]
    }
  ]
}
```

### 11.3 交互

- **插入**：斜杠命令 `/details` 或 `/折叠`。
- **展开/折叠**：点击摘要行的箭头图标。
- **编辑**：摘要行和内容区均可编辑。内容区支持所有块级节点（段落、列表、代码块等）。
- **样式**：左侧竖线 + 箭头旋转动画。

### 11.4 CSS 样式

```css
.note-details {
  border-left: 2px solid var(--border);
  border-radius: 4px;
  margin: 12px 0;
}

.note-details-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-weight: 500;
  user-select: none;
}

.note-details-summary::before {
  content: "▶";
  font-size: 10px;
  transition: transform 0.15s;
}

.note-details[open] .note-details-summary::before {
  transform: rotate(90deg);
}

.note-details-content {
  padding: 4px 12px 12px 24px;
}
```

---

## 12. 目录生成设计（P2）

### 12.1 实现方式

不使用 Tiptap 付费的 `TableOfContents` 扩展，而是自行实现：在文档顶部渲染一个 **目录面板组件**，通过扫描编辑器内容中的标题节点动态生成。

### 12.2 触发方式

- 编辑器顶部工具区新增"目录"按钮，点击展开/折叠目录面板。
- 斜杠命令 `/toc` 或 `/目录`，在光标处插入目录节点（可选方案）。

### 12.3 目录面板

显示在编辑器右侧或顶部的侧边栏/浮层：

```
目录
├─ 1. 项目背景
├─ 2. 技术方案
│  ├─ 2.1 架构设计
│  └─ 2.2 接口设计
└─ 3. 实施计划
```

- 实时扫描编辑器 `doc` 节点中所有 `heading` 节点。
- 按层级（H1 > H2 > H3）缩进显示。
- 点击目录项滚动到对应标题位置。
- 编辑内容变化时自动更新。
- 当前可见标题项高亮。

### 12.4 实现逻辑

```typescript
function buildTableOfContents(editor: Editor): TocItem[] {
  const items: TocItem[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      items.push({
        level: node.attrs.level,
        text: node.textContent,
        pos,
      })
    }
  })
  return items
}

interface TocItem {
  level: number
  text: string
  pos: number
}
```

点击目录项时：

```typescript
function scrollToHeading(editor: Editor, pos: number) {
  editor.commands.setTextSelection(pos)
  const dom = editor.view.domAtPos(pos)
  dom.node?.parentElement?.scrollIntoView({ behavior: "smooth", block: "start" })
}
```

---

## 13. 数学公式设计（P2）

### 13.1 依赖

```
@tiptap/extension-mathematics
katex
```

### 13.2 配置

```typescript
import Mathematics from "@tiptap/extension-mathematics"

Mathematics.configure({
  HTMLAttributes: { class: "math-node" },
})
```

### 13.3 交互

- **行内公式**：输入 `$` 开始，再输入 `$` 结束。例如 `$E = mc^2$`。
- **块级公式**：输入 `$$` 开始新行，在块内编写 LaTeX，再输入 `$$` 结束。
- **斜杠命令**：`/math` 或 `/公式`，插入空的行内公式节点。
- **编辑**：点击已渲染的公式进入编辑状态，显示 LaTeX 源码输入框。
- **渲染**：使用 KaTeX 渲染，高性能且支持大部分 LaTeX 数学语法。

### 13.4 CSS

```css
.math-node {
  display: inline-block;
  cursor: pointer;
}

.math-node .katex {
  font-size: 1.1em;
}

.math-node.ProseMirror-selectednode {
  outline: 2px solid var(--primary);
  border-radius: 2px;
}
```

---

## 14. 拖拽排序设计（P2）

### 14.1 实现方式

使用 Tiptap 开源的 Dropcursor（已启用）配合自定义的块级拖拽手柄。

不使用 Tiptap 付费的 `DragHandle` 扩展，而是通过 ProseMirror Plugin 实现：

### 14.2 拖拽手柄

鼠标悬停在任意块级节点（段落、标题、列表、代码块、图片等）左侧时，显示一个 `⠿` 拖拽手柄图标。

```css
.drag-handle {
  position: absolute;
  left: -24px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.15s;
  color: var(--muted-foreground);
  border-radius: 3px;
}

.drag-handle:hover {
  background: var(--muted);
  opacity: 1;
}
```

### 14.3 ProseMirror 插件

```typescript
function createDragHandlePlugin(): Plugin {
  return new Plugin({
    view(editorView) {
      const handle = document.createElement("div")
      handle.className = "drag-handle"
      handle.draggable = true
      handle.innerHTML = "⠿"
      editorView.dom.parentElement?.appendChild(handle)

      return {
        update(view, prevState) {
          // 根据鼠标位置计算最近的块级节点
          // 定位 handle 到该节点左侧
        },
        destroy() {
          handle.remove()
        },
      }
    },
  })
}
```

### 14.4 拖拽行为

- 拖拽时显示蓝色插入指示线（Dropcursor 扩展已支持）。
- 释放后，被拖拽的块移动到指示线位置。
- 支持跨层级拖拽（从列表内拖到列表外等）。

---

## 15. 上标/下标设计（P2）

```typescript
import Subscript from "@tiptap/extension-subscript"
import Superscript from "@tiptap/extension-superscript"
```

- **快捷键**：上标 `⌘+Shift+.`，下标 `⌘+Shift+,`。
- **工具栏**：归入"更多格式"下拉菜单。
- **斜杠命令**：不提供（太少用）。

---

## 16. 版本历史设计（P2）

### 16.1 存储

每次文档保存时，如果距上次版本快照超过 **5 分钟**，或内容变化超过 **500 字符**，自动创建版本快照：

```
versions/<noteId>/<timestamp>.json
```

文件内容为保存时的完整 `JSONContent`。

### 16.2 保留策略

| 时间范围 | 保留密度 |
| --- | --- |
| 最近 24 小时 | 所有版本 |
| 最近 7 天 | 每小时最多 1 个 |
| 最近 30 天 | 每天最多 1 个 |
| 30 天以上 | 删除 |

清理在应用启动时后台执行。

### 16.3 IPC 通道

| 通道 | 参数 | 返回 |
| --- | --- | --- |
| `versions:list` | `noteId` | `VersionSummary[]`（timestamp, wordCount, previewText） |
| `versions:get` | `noteId, timestamp` | `JSONContent` |
| `versions:restore` | `noteId, timestamp` | `NoteDocument`（将指定版本设为当前内容） |

### 16.4 UI

在文档标题区域添加"历史版本"按钮（时钟图标），点击展开版本列表侧面板：

```
历史版本
──────────────
今天 14:30   当前版本
今天 14:12   328 字
今天 11:45   315 字
昨天 20:03   298 字
──────────────
[恢复此版本]
```

- 点击版本项在编辑器中预览该版本内容（只读）。
- "恢复此版本"按钮将选中版本的内容覆盖到当前文档（会创建一个新版本快照保存当前内容作为备份）。

---

## 17. 模板系统设计（P3）

### 17.1 索引文件

```json
// templates.json
{
  "version": 1,
  "templates": [
    {
      "id": "tpl_001",
      "title": "会议纪要",
      "description": "标准会议纪要模板",
      "category": "工作",
      "content": { /* JSONContent */ },
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### 17.2 内置模板

| 模板名称 | 内容 |
| --- | --- |
| 会议纪要 | 日期、参会人、议题、讨论内容、决议、待办事项 |
| 周报 | 本周完成、下周计划、需要协助、备注 |
| 读书笔记 | 书名、作者、核心观点、精彩摘录、我的感想 |
| 项目计划 | 背景、目标、里程碑、资源、风险 |
| 技术方案 | 背景、现状、方案设计、接口设计、实施计划 |

### 17.3 交互

- 创建笔记时可选择"从模板创建"，弹出模板选择面板。
- 用户可将当前文档保存为模板（"更多"菜单 → "保存为模板"）。
- 模板管理在设置页面中，支持编辑、删除自定义模板。

### 17.4 IPC 通道

| 通道 | 用途 |
| --- | --- |
| `templates:list` | 列出所有模板 |
| `templates:get` | 获取模板内容 |
| `templates:create` | 创建模板（从当前文档） |
| `templates:update` | 更新模板 |
| `templates:delete` | 删除模板 |

---

## 18. 暗色模式设计（P3）

### 18.1 CSS 变量方案

在 `:root` 和 `.dark` 类上分别定义颜色变量：

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --muted: 210 40% 96%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --primary: 222.2 47.4% 46.2%;
  --border: 214.3 31.8% 91.4%;
  /* ... 现有亮色变量 */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --primary: 217.2 91.2% 59.8%;
  --border: 217.2 32.6% 17.5%;
  /* ... 暗色变量 */
}
```

### 18.2 切换机制

- 设置页面新增"外观"选项：跟随系统 / 亮色 / 暗色。
- 使用 `prefers-color-scheme` 媒体查询检测系统偏好。
- 通过在 `<html>` 上切换 `.dark` 类实现。
- 持久化到 `localStorage`。

### 18.3 代码块主题适配

亮色模式使用 `highlight.js/styles/github.css`，暗色模式使用 `highlight.js/styles/github-dark.css`。通过 CSS 变量或动态 link 标签切换。

---

## 19. 专注模式设计（P3）

### 19.1 功能

进入专注模式后：

- 隐藏侧边栏和笔记列表，编辑器全屏。
- 隐藏标签、反向链接、保存状态等次要信息。
- 仅保留标题和正文编辑区。
- 工具栏精简为最常用的格式按钮。
- 背景微调为更柔和的色调。
- 可选：打字机模式（当前编辑行始终居中）。

### 19.2 触发

- 快捷键：`⌘+Shift+F`。
- 编辑器标题栏的专注模式按钮（全屏图标）。
- `Escape` 退出专注模式。

### 19.3 实现

在 `App.tsx` 中维护 `isFocusMode` 状态，控制侧边栏和笔记列表的渲染。编辑器组件根据此状态调整布局和样式。

---

## 20. 打印/PDF 导出设计（P3）

### 20.1 功能

- 通过 Electron 的 `webContents.printToPDF()` 将当前文档导出为 PDF。
- 通过 `window.print()` 调用系统打印对话框。

### 20.2 实现

```typescript
// IPC: notes:exportPdf
ipcMain.handle("notes:exportPdf", async (event, { noteId }) => {
  const note = await noteStore.get(noteId)
  // 创建隐藏的 BrowserWindow 渲染文档
  const printWindow = new BrowserWindow({ show: false, ... })
  await printWindow.loadURL(`app://print?noteId=${noteId}`)
  const pdfData = await printWindow.webContents.printToPDF({
    marginsType: 0,
    pageSize: "A4",
    printBackground: true,
  })
  // 弹出保存对话框
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `${note.title}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  })
  if (filePath) {
    await fs.promises.writeFile(filePath, pdfData)
  }
  printWindow.close()
})
```

### 20.3 打印样式

```css
@media print {
  .sidebar, .note-list, .toolbar, .backlinks-panel, .save-status {
    display: none !important;
  }

  .note-editor {
    max-width: 100%;
    margin: 0;
    padding: 0;
  }

  .note-image {
    max-width: 100%;
    page-break-inside: avoid;
  }

  h1, h2, h3 {
    page-break-after: avoid;
  }

  pre, blockquote, table {
    page-break-inside: avoid;
  }
}
```

---

## 21. 工具栏升级设计

### 21.1 新工具栏布局

当前工具栏只有 7 个按钮，远不够。升级为分组式工具栏：

```
[H1][H2][H3] | [B][I][U][S][~] | [高亮▾] | [左][中][右] | [•列表][1.列表][☑任务] | [引用][代码][--] | [表格][图片][附件][链接] | [AI✨]
```

分组说明：

| 组 | 按钮 | 说明 |
| --- | --- | --- |
| 标题 | H1、H2、H3 | 标题级别 |
| 基础格式 | **B**、*I*、<u>U</u>、~~S~~、`code` | 粗体、斜体、下划线、删除线、行内代码 |
| 高亮 | 高亮 ▾ | 带颜色选择的高亮按钮 |
| 对齐 | ←  ↔  → | 左、中、右对齐 |
| 列表 | •、1.、☑ | 无序、有序、任务列表 |
| 块元素 | 引用、代码块、分割线 | 引用块、代码块、水平线 |
| 插入 | 表格、图片、附件、链接 | 插入类操作 |
| AI | ✨ | AI 写作 |

### 21.2 响应式

当编辑器宽度不够时，将低频按钮收入"更多"下拉菜单（`...`）。优先保留：标题、基础格式、列表、AI。

---

## 22. 斜杠命令扩展

### 22.1 新增命令

在现有的 "AI Write" 和 "Insert Note Link" 基础上，扩展斜杠命令列表：

| 命令 | 关键词 | 图标 | 说明 |
| --- | --- | --- | --- |
| AI 续写 | `/ai`、`/续写` | Sparkles | 已有 |
| 插入文档链接 | `/link`、`/链接` | FileText | 已有 |
| 插入图片 | `/image`、`/图片` | ImageIcon | 弹出文件选择对话框 |
| 插入附件 | `/file`、`/附件` | Paperclip | 弹出文件选择对话框 |
| 任务列表 | `/task`、`/待办` | CheckSquare | 插入任务列表 |
| 表格 | `/table`、`/表格` | Table | 插入 3x3 表格 |
| 代码块 | `/code`、`/代码` | Code | 插入代码块 |
| 引用块 | `/quote`、`/引用` | Quote | 插入引用块 |
| 分割线 | `/hr`、`/分割线` | Minus | 插入水平分割线 |
| 折叠块 | `/details`、`/折叠` | ChevronRight | 插入折叠块 |
| 数学公式 | `/math`、`/公式` | Sigma | 插入行内公式 |
| H1 标题 | `/h1`、`/标题1` | Heading1 | 转为一级标题 |
| H2 标题 | `/h2`、`/标题2` | Heading2 | 转为二级标题 |
| H3 标题 | `/h3`、`/标题3` | Heading3 | 转为三级标题 |
| 目录 | `/toc`、`/目录` | List | 滚动到顶部打开目录面板 |

### 22.2 命令分组

斜杠命令菜单中按类别分组显示：

```
AI
  ✨ AI 续写
基础
  H1 一级标题
  H2 二级标题
  H3 三级标题
列表
  ☑ 任务列表
插入
  📎 图片
  📄 附件
  🔗 文档链接
  📊 表格
  💻 代码块
  ❝ 引用块
  — 分割线
  ▸ 折叠块
  ∑ 数学公式
导航
  📑 目录
```

---

## 23. 快捷键体系

### 23.1 完整快捷键表

| 快捷键 | 功能 | 来源 |
| --- | --- | --- |
| `⌘+N` | 新建笔记 | 已有 |
| `⌘+F` | 搜索 | 已有 |
| `⌘+S` | 保存 | 已有 |
| `⌘+B` | 粗体 | StarterKit |
| `⌘+I` | 斜体 | StarterKit |
| `⌘+U` | 下划线 | **新增** |
| `⌘+Shift+X` | 删除线 | StarterKit |
| `⌘+E` | 行内代码 | StarterKit |
| `⌘+Shift+H` | 高亮 | **新增** |
| `⌘+Shift+7` | 有序列表 | StarterKit |
| `⌘+Shift+8` | 无序列表 | StarterKit |
| `⌘+Shift+9` | 任务列表 | **新增** |
| `⌘+Shift+B` | 引用块 | StarterKit |
| `⌘+Z` | 撤销 | StarterKit |
| `⌘+Shift+Z` | 重做 | StarterKit |
| `⌘+Shift+L` | 左对齐 | **新增** |
| `⌘+Shift+E` | 居中对齐 | **新增** |
| `⌘+Shift+R` | 右对齐 | **新增** |
| `⌘+Shift+F` | 专注模式 | **新增** |
| `⌘+K` | 插入链接 | 已有 |
| `⌘+P` | PDF 导出 | **新增** |
| `Tab` | 增加缩进 | 列表中 |
| `Shift+Tab` | 减少缩进 | 列表中 |
| `/` | 斜杠命令 | 已有 |
| `[[` | 文档链接 | 已有 |
| `Escape` | 关闭面板/退出专注模式 | 通用 |

---

## 24. Markdown 导入导出升级

### 24.1 新增支持的格式

| 元素 | Markdown 格式 | 导入 | 导出 |
| --- | --- | --- | --- |
| 任务列表 | `- [x] done` / `- [ ] todo` | ✅ | ✅ |
| 高亮 | `==highlighted==` | ✅ | ✅ |
| 下划线 | `<u>underlined</u>` | ✅ | ✅ |
| 上标 | `^superscript^` | ✅ | ✅ |
| 下标 | `~subscript~` | ✅ | ✅ |
| 数学公式（行内） | `$E = mc^2$` | ✅ | ✅ |
| 数学公式（块级） | `$$\n...\n$$` | ✅ | ✅ |
| 图片 | `![alt](asset://...)` | ✅ | 导出时复制图片文件到同级目录，改为相对路径 |
| 附件 | `[filename](asset://...)` | ✅ | 导出时复制附件到同级目录 |
| 折叠块 | `<details>` / `<summary>` HTML | ✅ | ✅ |
| 文本对齐 | `<p style="text-align: center">` | ✅ | ✅ |

### 24.2 图片导出策略

Markdown 导出时，如果文档包含图片或附件：

1. 在保存目录下创建 `<标题>_assets/` 子目录。
2. 将所有 `asset://` 引用的文件复制到该目录。
3. Markdown 中的引用改为相对路径：`![alt](<标题>_assets/img_001.png)`。

---

## 25. 完整 Tiptap 扩展列表

### 25.1 最终扩展配置

```typescript
const editor = useEditor({
  extensions: [
    // 基础 —— StarterKit（排除被升级替换的）
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,          // 被 CodeBlockLowlight 替换
    }),

    // 代码块语法高亮
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: "plaintext" }),

    // 链接
    Link.configure({ autolink: true, linkOnPaste: true, openOnClick: false }),

    // 文档链接（自定义）
    NoteLink,

    // 表格
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,

    // 任务列表
    TaskList,
    TaskItem.configure({ nested: true }),

    // 图片
    Image.configure({ inline: false, allowBase64: false }),

    // 附件（自定义）
    FileAttachment,

    // 格式 Marks
    Underline,
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,

    // 文本对齐
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right"] }),

    // 折叠块
    Details,
    DetailsSummary,
    DetailsContent,

    // 数学公式
    Mathematics,

    // 占位符
    Placeholder.configure({ placeholder: "..." }),

    // 排版自动纠正
    Typography,
  ],
})
```

### 25.2 需要新增的 npm 依赖

| 包名 | 用途 |
| --- | --- |
| `@tiptap/extension-image` | 图片节点 |
| `@tiptap/extension-task-list` | 任务列表 |
| `@tiptap/extension-task-item` | 任务项 |
| `@tiptap/extension-code-block-lowlight` | 代码块语法高亮 |
| `lowlight` | 语法高亮引擎 |
| `@tiptap/extension-highlight` | 文本高亮 |
| `@tiptap/extension-underline` | 下划线 |
| `@tiptap/extension-text-align` | 文本对齐 |
| `@tiptap/extension-subscript` | 下标 |
| `@tiptap/extension-superscript` | 上标 |
| `@tiptap/extension-details` | 折叠块 |
| `@tiptap/extension-details-content` | 折叠块内容 |
| `@tiptap/extension-details-summary` | 折叠块摘要 |
| `@tiptap/extension-mathematics` | 数学公式 |
| `katex` | 公式渲染 |
| `@tiptap/extension-typography` | 排版自动纠正 |

共 **16 个新依赖**。

---

## 26. 新增模块清单

### 26.1 主进程

| 文件 | 职责 |
| --- | --- |
| `electron/main/services/asset-store.ts` | 资源文件的存储、读取、删除、清理 |
| `electron/main/services/version-store.ts` | 版本快照的创建、查询、清理 |
| `electron/main/services/template-store.ts` | 模板的 CRUD |
| `electron/main/ipc/assets.ts` | 资源管理 IPC 注册 |
| `electron/main/ipc/versions.ts` | 版本历史 IPC 注册 |
| `electron/main/ipc/templates.ts` | 模板 IPC 注册 |

### 26.2 渲染进程

| 文件 | 职责 |
| --- | --- |
| `src/components/editor/file-attachment.tsx` | fileAttachment 自定义 Tiptap 节点 |
| `src/components/editor/image-node.tsx` | 图片节点渲染（操作浮层、尺寸调整） |
| `src/components/editor/image-lightbox.tsx` | 图片灯箱查看器 |
| `src/components/editor/code-block-node.tsx` | 代码块渲染（语言选择、复制按钮） |
| `src/components/editor/toolbar.tsx` | 工具栏组件（从 note-editor.tsx 拆出） |
| `src/components/editor/slash-menu.tsx` | 斜杠命令菜单组件（从 note-editor.tsx 拆出） |
| `src/components/editor/toc-panel.tsx` | 目录面板 |
| `src/components/version-history.tsx` | 版本历史侧面板 |
| `src/components/template-picker.tsx` | 模板选择面板 |

### 26.3 共享类型

在 `src/shared/` 中新增：

```typescript
// src/shared/assets.ts
export interface ImageAssetResult { ... }
export interface FileAssetResult { ... }

// src/shared/versions.ts
export interface VersionSummary { ... }

// src/shared/templates.ts
export interface NoteTemplate { ... }
```

---

## 27. 分阶段实施计划

### Phase 1：核心编辑增强（1 周）

**目标**：补齐笔记软件的基础编辑能力。

- 任务列表（TaskList + TaskItem）
- 下划线（Underline）
- 高亮标记（Highlight，多色）
- 文本对齐（TextAlign）
- 代码块语法高亮（CodeBlockLowlight + lowlight）
- 工具栏重构（分组布局、新按钮）
- 斜杠命令扩展（新增命令项）
- 对应的 CSS 样式
- Markdown 导入导出适配（任务列表、高亮等）

### Phase 2：图片与附件（1 周）

**目标**：让笔记能包含图片和文件，这是用户明确要求的核心功能。

- `asset://` 自定义协议注册
- `AssetStore` 服务（资源文件管理）
- 资源 IPC 通道
- `@tiptap/extension-image` 集成
- 图片粘贴、拖拽、文件选择器
- 图片渲染（操作浮层、尺寸调整）
- 图片灯箱
- `FileAttachment` 自定义节点
- 附件卡片渲染与打开
- 资源清理逻辑（保存时、删除时）
- Markdown 导出时资源文件打包

### Phase 3：高级编辑功能（1 周）

**目标**：提供进阶编辑能力，提升信息组织效率。

- 折叠块（Details + DetailsSummary + DetailsContent）
- 数学公式（Mathematics + KaTeX）
- 上标 / 下标
- Typography 排版自动纠正
- 拖拽手柄（ProseMirror Plugin）
- 目录面板
- 代码块语言选择器和复制按钮

### Phase 4：版本、模板与体验（1 周）

**目标**：提供内容安全网和效率工具。

- `VersionStore` 服务
- 版本快照自动创建
- 版本历史面板 UI
- 版本恢复
- 版本清理策略
- `TemplateStore` 服务
- 内置模板 + 自定义模板
- 模板选择面板

### Phase 5：外观与输出（数天）

**目标**：视觉和输出完善。

- 暗色模式（CSS 变量 + 切换逻辑）
- 代码块主题适配
- 专注模式
- 打印样式
- PDF 导出

---

## 28. 评分自评

| 维度 | 权重 | 当前得分 | 实施后得分 | 说明 |
| --- | --- | --- | --- | --- |
| **富文本编辑** | 25% | 15 | 23 | 补齐任务列表、高亮、下划线、对齐、折叠、公式、语法高亮 |
| **图片与附件** | 20% | 0 | 19 | 从无到完整支持插入、存储、查看、拖拽、粘贴 |
| **文档组织** | 15% | 12 | 14 | 已有层级、标签、搜索、反向链接；新增模板、目录 |
| **AI 能力** | 10% | 8 | 8 | AI 续写已实现，本次不扩展 |
| **版本与安全** | 10% | 3 | 9 | 新增版本历史、自动快照 |
| **视觉体验** | 10% | 6 | 9 | 暗色模式、专注模式、拖拽手柄 |
| **导入导出** | 5% | 3 | 5 | Markdown 扩展格式 + PDF 导出 + 资源打包 |
| **键盘效率** | 5% | 3 | 5 | 完整快捷键体系 |
| **合计** | 100% | **50** | **92** | |

---

## 29. 总结

本方案基于 Tiptap 的开源扩展生态，通过 **16 个新 npm 依赖** + **Electron 自定义协议** + **本地资源管理服务**，将 Metis Note 从一个基础文本编辑器升级为功能完善的本地笔记软件。

核心设计决策：

1. **图片/附件使用 `asset://` 自定义协议**：安全、可控、不暴露真实路径、支持导出打包。
2. **所有新功能优先使用 Tiptap 官方开源扩展**：减少自定义代码量，降低维护成本。仅图片操作浮层、附件卡片、代码块 UI、目录面板、拖拽手柄需要自定义实现。
3. **斜杠命令作为功能入口的统一范式**：用户只需记住 `/`，即可发现所有编辑能力。
4. **分 5 个阶段实施**：每个阶段产出可用增量，Phase 1-2 完成后即可达到 80+ 分。
