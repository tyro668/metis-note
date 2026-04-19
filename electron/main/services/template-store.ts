import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { JSONContent } from "@tiptap/core"
import { getMessages, type AppLocale } from "../../../src/shared/i18n"
import {
  buildPreview,
  createEmptyDocument,
  extractPlainTextFromContent,
  normalizeTitle,
  type NoteDocument,
} from "../../../src/shared/notes"
import type { SaveTemplateInput, TemplateDocument, TemplateSummary } from "../../../src/shared/templates"
import { AssetStore } from "./asset-store"

interface StoredTemplate {
  id: string
  title: string
  description: string
  category: string
  content: JSONContent
  createdAt: string
  updatedAt: string
}

interface TemplateIndexPayload {
  version: 1
  templates: StoredTemplate[]
}

interface BuiltinTemplateDefinition {
  id: string
  title: string
  description: string
  category: string
  sections: string[]
}

export class TemplateStore {
  private readonly indexPath: string
  private readonly messages
  private initialized = false

  constructor(
    baseDir: string,
    private readonly locale: AppLocale,
    private readonly assetStore?: AssetStore,
  ) {
    this.indexPath = path.join(baseDir, "templates.json")
    this.messages = getMessages(locale)
  }

  async ensureReady() {
    if (this.initialized) {
      return
    }

    await mkdir(path.dirname(this.indexPath), { recursive: true })

    try {
      await readFile(this.indexPath, "utf-8")
    } catch {
      await this.writeIndex([])
    }

    this.initialized = true
  }

  async list(): Promise<TemplateSummary[]> {
    await this.ensureReady()
    const customTemplates = await this.readIndex()
    const builtinTemplates = this.getBuiltinTemplates()

    return [...builtinTemplates, ...customTemplates.map((template) => this.toDocument(template, false))]
      .map((template) => this.toSummary(template))
      .sort((left, right) => {
        if (left.builtIn !== right.builtIn) {
          return left.builtIn ? -1 : 1
        }

        return left.title.localeCompare(right.title, this.locale)
      })
  }

  async get(id: string): Promise<TemplateDocument | null> {
    await this.ensureReady()
    const builtin = this.getBuiltinTemplates().find((template) => template.id === id)

    if (builtin) {
      return builtin
    }

    const customTemplates = await this.readIndex()
    const matched = customTemplates.find((template) => template.id === id)

    return matched ? this.toDocument(matched, false) : null
  }

  async createFromNote(note: NoteDocument, payload: SaveTemplateInput): Promise<TemplateDocument> {
    await this.ensureReady()
    const templates = await this.readIndex()
    const now = new Date().toISOString()
    const id = `tpl_${randomUUID().replace(/-/g, "").slice(0, 12)}`
    const title = normalizeTitle(payload.title, this.locale)
    const content = this.assetStore ? await this.assetStore.cloneReferencedAssets(note.content, id) : note.content
    const template: StoredTemplate = {
      id,
      title,
      description: payload.description?.trim() || buildPreview(note.plainText, this.locale),
      category: payload.category?.trim() || this.messages.settings.templates.customCategoryFallback,
      content,
      createdAt: now,
      updatedAt: now,
    }

    await this.writeIndex([template, ...templates])

    return this.toDocument(template, false)
  }

  async update(id: string, payload: SaveTemplateInput): Promise<TemplateDocument> {
    await this.ensureReady()
    const templates = await this.readIndex()
    const current = templates.find((template) => template.id === id)

    if (!current) {
      throw new Error(this.messages.settings.templates.errors.notFound)
    }

    const nextContent = payload.content ?? current.content
    const next: StoredTemplate = {
      ...current,
      title: normalizeTitle(payload.title ?? current.title, this.locale),
      description: payload.description?.trim() ?? current.description,
      category: payload.category?.trim() ?? current.category,
      content: nextContent,
      updatedAt: new Date().toISOString(),
    }

    await this.writeIndex(templates.map((template) => (template.id === id ? next : template)))

    if (payload.content) {
      await this.assetStore?.cleanupUnreferenced(id, nextContent)
    }

    return this.toDocument(next, false)
  }

  async delete(id: string): Promise<TemplateDocument> {
    await this.ensureReady()
    const templates = await this.readIndex()
    const current = templates.find((template) => template.id === id)

    if (!current) {
      throw new Error(this.messages.settings.templates.errors.notFound)
    }

    await this.writeIndex(templates.filter((template) => template.id !== id))
    await this.assetStore?.deleteNoteAssets(id)

    return this.toDocument(current, false)
  }

  private getBuiltinTemplates(): TemplateDocument[] {
    return this.getBuiltinDefinitions().map((definition) => ({
      id: definition.id,
      title: definition.title,
      description: definition.description,
      category: definition.category,
      previewText: buildPreview(extractPlainTextFromContent(this.createStructuredContent(definition.title, definition.sections)), this.locale),
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      builtIn: true,
      content: this.createStructuredContent(definition.title, definition.sections),
    }))
  }

  private getBuiltinDefinitions(): BuiltinTemplateDefinition[] {
    if (this.locale === "en") {
      return [
        {
          id: "builtin-meeting-notes",
          title: "Meeting Notes",
          description: "Structured meeting notes with attendees, decisions, and follow-up tasks.",
          category: "Work",
          sections: ["Date", "Attendees", "Agenda", "Discussion", "Decisions", "Action Items"],
        },
        {
          id: "builtin-weekly-report",
          title: "Weekly Report",
          description: "Summarize weekly progress, next steps, and collaboration needs.",
          category: "Work",
          sections: ["Completed This Week", "Plan for Next Week", "Need Support", "Notes"],
        },
        {
          id: "builtin-reading-note",
          title: "Reading Note",
          description: "Capture key ideas, quotes, and personal reflections from a book.",
          category: "Study",
          sections: ["Book Title", "Author", "Key Ideas", "Quotes", "Reflections"],
        },
        {
          id: "builtin-project-plan",
          title: "Project Plan",
          description: "Outline goals, milestones, resources, and delivery risks.",
          category: "Project",
          sections: ["Background", "Goals", "Milestones", "Resources", "Risks"],
        },
        {
          id: "builtin-technical-design",
          title: "Technical Design",
          description: "Draft a solution proposal with architecture, interfaces, and rollout steps.",
          category: "Engineering",
          sections: ["Background", "Current State", "Solution Design", "Interface Design", "Execution Plan"],
        },
      ]
    }

    return [
      {
        id: "builtin-meeting-notes",
        title: "会议纪要",
        description: "包含参会人、讨论内容、决议和待办事项的标准会议模板。",
        category: "工作",
        sections: ["日期", "参会人", "议题", "讨论内容", "会议决议", "待办事项"],
      },
      {
        id: "builtin-weekly-report",
        title: "周报",
        description: "汇总本周完成、下周计划和协作需求的高频工作模板。",
        category: "工作",
        sections: ["本周完成", "下周计划", "需要协助", "备注"],
      },
      {
        id: "builtin-reading-note",
        title: "读书笔记",
        description: "记录作者观点、精彩摘录和个人感想的阅读模板。",
        category: "学习",
        sections: ["书名", "作者", "核心观点", "精彩摘录", "我的感想"],
      },
      {
        id: "builtin-project-plan",
        title: "项目计划",
        description: "梳理项目背景、目标、里程碑和风险的规划模板。",
        category: "项目",
        sections: ["背景", "目标", "里程碑", "资源", "风险"],
      },
      {
        id: "builtin-technical-design",
        title: "技术方案",
        description: "沉淀方案背景、接口设计和实施计划的技术文档模板。",
        category: "研发",
        sections: ["背景", "现状", "方案设计", "接口设计", "实施计划"],
      },
    ]
  }

  private createStructuredContent(title: string, sections: string[]): JSONContent {
    return {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: {
            level: 1,
          },
          content: [
            {
              type: "text",
              text: title,
            },
          ],
        },
        ...sections.flatMap((section) => [
          {
            type: "heading",
            attrs: {
              level: 2,
            },
            content: [
              {
                type: "text",
                text: section,
              },
            ],
          },
          {
            type: "paragraph",
          },
        ]),
      ],
    }
  }

  private toDocument(template: StoredTemplate, builtIn: boolean): TemplateDocument {
    return {
      ...template,
      previewText: buildPreview(extractPlainTextFromContent(template.content), this.locale),
      builtIn,
    }
  }

  private toSummary(template: TemplateDocument): TemplateSummary {
    return {
      id: template.id,
      title: template.title,
      description: template.description,
      category: template.category,
      previewText: template.previewText,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      builtIn: template.builtIn,
    }
  }

  private async readIndex() {
    const raw = await readFile(this.indexPath, "utf-8")
    const payload = JSON.parse(raw) as Partial<TemplateIndexPayload>

    return (payload.templates ?? []).map((template) => ({
      id: template.id || `tpl_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      title: normalizeTitle(template.title, this.locale),
      description: template.description?.trim() || "",
      category: template.category?.trim() || this.messages.settings.templates.customCategoryFallback,
      content: template.content ?? createEmptyDocument(),
      createdAt: template.createdAt || new Date().toISOString(),
      updatedAt: template.updatedAt || template.createdAt || new Date().toISOString(),
    }))
  }

  private async writeIndex(templates: StoredTemplate[]) {
    const payload: TemplateIndexPayload = {
      version: 1,
      templates,
    }

    await writeFile(this.indexPath, JSON.stringify(payload, null, 2), "utf-8")
  }
}
