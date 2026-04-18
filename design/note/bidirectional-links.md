# 文档双向链接设计文档

**适用范围**：Metis Note 文档间引用与反向链接能力

---

## 1. 背景

当前 Metis Note 的文档之间只有父子层级关系（`parentId`），没有跨层级的引用关系。编辑器中的链接功能仅支持外部 HTTP URL，无法链接到另一篇文档。

知识管理的核心价值在于连接。当用户在 A 文档中提到 B 文档时，应该能直接插入一个指向 B 的链接；同时在打开 B 文档时，能看到"哪些文档引用了我"，从而自然地在文档间导航，形成知识网络。

本设计的目标是：

> 用户在编辑器中可以插入指向其他文档的链接。被链接的文档顶部自动显示反向链接列表，点击即可跳转到引用方文档。

## 2. 设计目标

1. 支持在文档正文中插入 **文档链接**，链接指向应用内的另一篇文档。
2. 文档链接以可识别的样式内联显示在正文中，点击后跳转到目标文档。
3. 被引用的文档顶部自动显示 **反向链接区域**，列出所有引用了该文档的文档。
4. 引用关系在文档保存时自动提取和更新，不需要用户手动维护。
5. 目标文档被删除或移入回收站后，链接显示为失效状态，不影响源文档。

## 3. 设计原则

### 3.1 自动双向

用户只需要在 A 中插入指向 B 的链接，系统自动在 B 上建立反向引用记录。用户不需要在 B 中做任何操作。

### 3.2 引用独立于层级

文档链接是独立于父子层级的关系。A 链接 B 不意味着 A 是 B 的父文档。两种关系各自独立。

### 3.3 最终一致

引用关系在文档保存时更新。不要求实时同步，允许在保存完成前短暂的不一致。

### 3.4 链接容错

目标文档被删除后，源文档中的链接不会消失，而是显示为"文档已删除"的失效样式。用户可以手动移除失效链接。

## 4. 用户流程

### 4.1 插入文档链接

1. 用户在编辑模式下，通过以下方式之一触发：
   - 在斜杠命令菜单中选择 **插入文档链接**。
   - 输入 `[[` 触发文档搜索弹窗。
2. 弹出文档搜索面板，用户输入关键词搜索文档。
3. 搜索结果列出匹配的文档（标题匹配），显示标题和路径。
4. 用户选择目标文档。
5. 编辑器在光标位置插入一个文档链接节点，显示为目标文档的标题。
6. 如果通过 `[[` 触发，`[[` 字符被替换为链接节点。

### 4.2 查看文档链接

文档链接在正文中以特殊样式内联显示：

- 带有文档图标前缀。
- 文字使用链接色（如蓝色 `#375bd2`）。
- 鼠标悬停时显示下划线和目标文档路径提示。
- 失效链接（目标已删除）显示为灰色删除线，提示"文档已删除"。

### 4.3 点击文档链接跳转

- 在预览模式下，点击文档链接直接跳转到目标文档。
- 在编辑模式下，按住 `⌘`（macOS）点击链接跳转。
- 跳转行为与在侧边栏中点击文档一致：切换当前选中文档。

### 4.4 查看反向链接

1. 用户打开一篇文档。
2. 如果该文档被其他文档引用，编辑器顶部（标题和标签下方、正文上方）显示反向链接区域。
3. 反向链接区域显示为折叠式面板：
   - 默认折叠，显示"N 篇文档引用了此文档"。
   - 展开后列出所有引用方文档的标题，点击可跳转。
4. 如果没有任何文档引用此文档，不显示反向链接区域。

## 5. 文档链接节点设计

### 5.1 Tiptap 节点类型

新增一个 Tiptap 自定义 inline 节点 `noteLink`：

```typescript
{
  type: "noteLink",
  attrs: {
    noteId: string,       // 目标文档 ID
    title: string         // 插入时的目标文档标题（用于显示和离线回退）
  }
}
```

### 5.2 节点行为

- `noteLink` 是 **inline 节点**，可以出现在段落文本中间。
- 不可编辑内部文字，整体选中和删除。
- 渲染时优先使用 `noteId` 对应文档的最新标题（如果文档仍然存在）；如果文档已删除，回退到 `attrs.title` 并显示失效样式。

### 5.3 JSONContent 示例

```json
{
  "type": "paragraph",
  "content": [
    { "type": "text", "text": "详细内容请参考 " },
    {
      "type": "noteLink",
      "attrs": {
        "noteId": "a1b2c3d4-...",
        "title": "项目计划书"
      }
    },
    { "type": "text", "text": " 中的描述。" }
  ]
}
```

## 6. 引用关系存储设计

### 6.1 引用索引

在现有存储目录中新增一个引用索引文件：

```
<baseDir>/
  index.json              ← 现有笔记索引
  links.json              ← 新增：文档引用关系索引
  items/
    <uuid>.json           ← 现有笔记内容
```

### 6.2 索引结构

```typescript
interface NoteLinksPayload {
  version: 1
  // 正向：sourceId → 该文档链接到的目标文档 ID 列表
  outgoing: Record<string, string[]>
}
```

只存储正向引用（`outgoing`），反向引用在内存中通过反转计算得出。这样保证单一事实源，避免正反向不一致。

### 6.3 索引更新时机

引用索引在以下时机更新：

| 事件 | 行为 |
| --- | --- |
| 文档保存（create / update） | 扫描文档内容中的所有 `noteLink` 节点，提取 `noteId` 列表，更新该文档的 `outgoing` 记录 |
| 文档永久删除（deleteForever） | 移除该文档的 `outgoing` 记录 |
| 应用启动 | 加载 `links.json` 到内存并构建反向索引 |

### 6.4 反向索引构建

应用启动时或 `links.json` 变更后，在内存中构建反向索引：

```typescript
// 内存中的反向索引：targetId → 引用了该文档的源文档 ID 列表
backlinks: Map<string, Set<string>>
```

构建逻辑：遍历所有 `outgoing` 记录，对每个目标 ID 添加到对应的 `backlinks` 集合中。

### 6.5 查询接口

| 查询 | 输入 | 输出 | 用途 |
| --- | --- | --- | --- |
| 获取反向链接 | `targetNoteId` | `NoteSummary[]` | 被引用文档顶部展示反向链接列表 |
| 获取正向链接 | `sourceNoteId` | `string[]` | 内部使用，维护索引 |

## 7. 文档搜索面板设计

### 7.1 触发方式

| 触发 | 行为 |
| --- | --- |
| 斜杠命令"插入文档链接" | 弹出文档搜索面板 |
| 输入 `[[` | 弹出文档搜索面板，`[[` 字符待确认后删除 |

### 7.2 面板内容

- 顶部：搜索输入框，自动聚焦。
- 下方：文档列表，按标题匹配过滤。
- 每个结果项显示：文档标题 + 父文档路径（如有）。
- 默认展示最近更新的文档（未输入搜索词时）。
- 不显示当前正在编辑的文档（不允许自引用）。
- 不显示已移入回收站的文档。

### 7.3 面板交互

- `↑` `↓` 键盘导航结果列表。
- `Enter` 选择当前高亮项，插入文档链接。
- `Escape` 关闭面板，不插入任何内容。
- 点击结果项直接插入。
- 搜索为前端过滤，基于已加载的文档列表，不需要额外 IPC 调用。

## 8. 反向链接区域设计

### 8.1 位置

反向链接区域显示在编辑器内，位于：

- 文档标题、标签行之下
- 正文内容之上
- 工具栏之下（编辑模式时）

### 8.2 折叠态（默认）

```
📎 3 篇文档引用了此文档                           [展开 ▾]
```

- 左侧显示链接图标和引用计数。
- 右侧显示展开按钮。
- 整行可点击展开。

### 8.3 展开态

```
📎 3 篇文档引用了此文档                           [收起 ▴]
├─ 项目计划书
├─ 2024 年度总结
└─ 技术方案评审
```

- 每个引用方文档显示为可点击的链接。
- 点击后跳转到该文档。
- 文档标题前显示文档图标。

### 8.4 无引用时

不显示反向链接区域，不占用空间。

## 9. 技术架构

### 9.1 需要新增的模块

| 模块 | 位置 | 职责 |
| --- | --- | --- |
| noteLink 节点扩展 | `src/components/editor/note-link.ts` | Tiptap 自定义 inline 节点，渲染文档链接 |
| 文档搜索面板 | `src/components/editor/note-link-picker.tsx` | 弹出式文档搜索和选择面板 |
| 反向链接面板 | `src/components/note-backlinks.tsx` | 文档顶部的反向链接折叠区域 |
| 链接索引服务 | `electron/main/services/note-link-store.ts` | 管理 `links.json`，维护正向和反向索引 |
| 链接 IPC | `electron/main/ipc/note-links.ts` | 反向链接查询的 IPC 通道 |

### 9.2 IPC 通道设计

| 通道 | 方向 | 参数 | 返回 | 用途 |
| --- | --- | --- | --- | --- |
| `noteLinks:getBacklinks` | renderer → main | `noteId: string` | `NoteSummary[]` | 获取引用了指定文档的文档列表 |
| `noteLinks:resolveLinks` | renderer → main | `noteIds: string[]` | `Record<string, { title: string; exists: boolean }>` | 批量解析文档链接的最新标题和存在状态 |

### 9.3 Preload 桥接 API

在 `window.metisNote` 上新增 `noteLinks` 命名空间：

```typescript
window.metisNote.noteLinks.getBacklinks(noteId: string) => Promise<NoteSummary[]>
window.metisNote.noteLinks.resolveLinks(noteIds: string[]) => Promise<Record<string, { title: string; exists: boolean }>>
```

### 9.4 引用提取逻辑

文档保存时，从 `JSONContent` 中递归提取所有 `noteLink` 节点的 `noteId`：

```typescript
function extractNoteLinks(content: JSONContent): string[] {
  const ids = new Set<string>()

  function walk(node: JSONContent) {
    if (node.type === "noteLink" && node.attrs?.noteId) {
      ids.add(node.attrs.noteId)
    }
    if (node.content) {
      for (const child of node.content) {
        walk(child)
      }
    }
  }

  walk(content)
  return Array.from(ids)
}
```

此函数在 `NoteStore.create()` 和 `NoteStore.update()` 中调用，结果传递给 `NoteLinkStore.updateOutgoing(sourceId, targetIds)`.

### 9.5 数据流

**插入文档链接：**

```
用户输入 [[ 或选择斜杠命令
  → 弹出文档搜索面板（基于内存中的文档列表过滤）
  → 用户选择目标文档
  → 编辑器插入 noteLink 节点
  → 用户保存文档
  → NoteStore.update() 调用 extractNoteLinks()
  → NoteLinkStore.updateOutgoing(sourceId, targetIds)
  → links.json 更新，内存反向索引刷新
```

**查看反向链接：**

```
用户打开文档 B
  → NoteEditor 请求 noteLinks:getBacklinks(B.id)
  → NoteLinkStore 查询内存中的反向索引
  → 返回引用了 B 的文档 Summary 列表
  → 反向链接面板渲染列表
```

## 10. Markdown 导入导出

### 10.1 导出

文档链接节点在 Markdown 导出时转换为：

```markdown
[项目计划书](metis-note://note/a1b2c3d4-...)
```

使用 `metis-note://note/<id>` 作为内部链接 URI scheme，区别于外部 HTTP 链接。

### 10.2 导入

Markdown 导入时，识别 `metis-note://note/<id>` 格式的链接，将其转换为 `noteLink` 节点。其他链接继续作为普通外部链接处理。

## 11. 边界情况处理

### 11.1 目标文档被删除

- 源文档中的 `noteLink` 节点保留，不自动移除。
- 渲染时通过 `resolveLinks` 检测到文档不存在。
- 显示为失效样式：灰色文字 + 删除线 + "文档已删除" 提示。
- 用户可手动删除该链接节点。

### 11.2 目标文档被移入回收站

- 与删除处理一致，链接显示为失效。
- 如果目标文档被恢复，链接自动恢复正常显示。

### 11.3 目标文档标题变更

- `noteLink` 节点中的 `attrs.title` 是插入时的快照。
- 渲染时优先使用 `resolveLinks` 返回的最新标题。
- 如果目标文档存在，始终显示最新标题。

### 11.4 自引用

- 文档搜索面板中不显示当前文档，阻止自引用。
- 如果通过其他方式（如导入）产生了自引用，渲染时正常显示但不记入反向链接。

### 11.5 循环引用

- A 链接 B，B 链接 A 是合法的。
- 反向链接显示不受影响，每篇文档各自显示自己的反向链接。

### 11.6 批量删除

- 文档永久删除时，移除该文档的 `outgoing` 记录。
- 反向索引同步更新：从所有目标文档的 backlinks 中移除该文档。
- 其他文档中指向已删除文档的链接按 11.1 处理。

## 12. 分阶段落地

### Phase 1：基础链接能力

- `noteLink` Tiptap 自定义节点。
- 文档搜索面板（斜杠命令 + `[[` 触发）。
- 链接节点渲染与点击跳转。
- `links.json` 引用索引和内存反向索引。

### Phase 2：反向链接展示

- 反向链接查询 IPC。
- 编辑器顶部反向链接折叠面板。
- 链接状态解析（最新标题、失效检测）。

### Phase 3：导入导出与健壮性

- Markdown 导出/导入中的文档链接格式。
- 失效链接的优雅降级。
- 索引文件的完整性校验和自动修复。

### Phase 4：体验增强

- 链接预览：鼠标悬停在文档链接上时显示目标文档摘要。
- 图谱视图：可视化文档之间的引用关系网络。
- 引用计数：在文档列表中显示每篇文档的被引用次数。

## 13. 总结

文档双向链接让 Metis Note 从树状笔记工具进化为知识网络工具：

- 用户通过 `[[` 或斜杠命令在文档中插入指向其他文档的链接。
- 被引用的文档顶部自动显示反向链接列表，形成双向可导航的关系。
- 引用关系通过 `links.json` 索引自动维护，用户不需要手动管理。
- 目标文档被删除时链接优雅降级，不影响源文档完整性。
- 链接独立于父子层级，为跨层级的知识关联提供基础。
