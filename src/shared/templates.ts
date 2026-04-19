import type { JSONContent } from "@tiptap/core"

export interface TemplateSummary {
  id: string
  title: string
  description: string
  category: string
  previewText: string
  createdAt: string
  updatedAt: string
  builtIn: boolean
}

export interface TemplateDocument extends TemplateSummary {
  content: JSONContent
}

export interface SaveTemplateInput {
  title: string
  description?: string
  category?: string
  content?: JSONContent
}
