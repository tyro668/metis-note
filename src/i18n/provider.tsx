import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { DEFAULT_LOCALE, getMessages, resolveLocale, type AppLocale } from "@/shared/i18n"

interface I18nContextValue {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  messages: ReturnType<typeof getMessages>
}

const STORAGE_KEY = "metis-note.locale"

const I18nContext = createContext<I18nContextValue | null>(null)

function initialLocale(): AppLocale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE
  }

  const storedLocale = window.localStorage.getItem(STORAGE_KEY)

  if (storedLocale) {
    return resolveLocale(storedLocale)
  }

  return resolveLocale(window.navigator.language)
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(initialLocale)
  const messages = useMemo(() => getMessages(locale), [locale])

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = messages.meta.title
    window.localStorage.setItem(STORAGE_KEY, locale)
  }, [locale, messages.meta.title])

  return <I18nContext.Provider value={{ locale, setLocale, messages }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider")
  }

  return context
}
