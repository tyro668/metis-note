import type { JSONContent } from "@tiptap/core"
import type { Editor } from "@tiptap/react"
import type { AppLocale } from "@/shared/i18n"

const CONTEXT_BEFORE_LIMIT = 3000

export interface AiWriteContext {
  title: string
  contextBefore: string
}

export function collectAiWriteContext(editor: Editor, title: string, position = editor.state.selection.from): AiWriteContext {
  const boundedPosition = Math.max(0, Math.min(position, editor.state.doc.content.size))
  const contextBefore = editor.state.doc.textBetween(0, boundedPosition, "\n\n", "\n").slice(-CONTEXT_BEFORE_LIMIT)

  return {
    title: title.trim(),
    contextBefore,
  }
}

export function getAiWriteSystemPrompt(locale: AppLocale) {
  if (locale === "en") {
    return [
      "You are a writing assistant who helps continue the user's document naturally.",
      "Requirements:",
      "- Keep the language, tone, and style consistent with the existing content.",
      "- Output only the continuation text.",
      "- Do not repeat the title, add explanations, or include meta descriptions.",
      "- Output plain text without Markdown formatting markers.",
    ].join("\n")
  }

  return [
    "你是一个写作助手，帮助用户续写文档内容。根据文档标题和已有内容，自然地继续写作。",
    "要求：",
    "- 保持与已有内容一致的语言、风格和语气。",
    "- 直接输出续写内容，不要输出解释、标题重复或元描述。",
    "- 输出纯文本，不要使用 Markdown 格式标记。",
  ].join("\n")
}

export function buildAiWriteUserPrompt(locale: AppLocale, context: AiWriteContext) {
  if (locale === "en") {
    return `Document title: ${context.title}

Existing content:
${context.contextBefore}

[Continue writing from here]`
  }

  return `文档标题：${context.title}

已有内容：
${context.contextBefore}

[请从这里续写]`
}

export function buildAiWriteInsertContent(text: string): JSONContent[] {
  const normalized = text.replace(/\r\n/g, "\n").trim()

  if (!normalized) {
    return []
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const lines = paragraph.split("\n")
      const content: JSONContent[] = []

      lines.forEach((line, index) => {
        if (line) {
          content.push({
            type: "text",
            text: line,
          })
        }

        if (index < lines.length - 1) {
          content.push({
            type: "hardBreak",
          })
        }
      })

      return {
        type: "paragraph",
        content: content.length > 0 ? content : undefined,
      } satisfies JSONContent
    })
}
