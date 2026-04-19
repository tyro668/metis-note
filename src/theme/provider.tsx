import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type AppearanceMode = "system" | "light" | "dark"
export type ResolvedTheme = "light" | "dark"

interface ThemeContextValue {
  appearance: AppearanceMode
  resolvedTheme: ResolvedTheme
  setAppearance: (appearance: AppearanceMode) => void
}

const STORAGE_KEY = "metis-note.appearance"
const ThemeContext = createContext<ThemeContextValue | null>(null)

function isAppearanceMode(value: string | null): value is AppearanceMode {
  return value === "system" || value === "light" || value === "dark"
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "light"
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function getInitialAppearance(): AppearanceMode {
  if (typeof window === "undefined") {
    return "system"
  }

  const storedValue = window.localStorage.getItem(STORAGE_KEY)

  if (isAppearanceMode(storedValue)) {
    return storedValue
  }

  return "system"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceMode>(getInitialAppearance)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light")
    }

    setSystemTheme(mediaQuery.matches ? "dark" : "light")

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange)

      return () => {
        mediaQuery.removeEventListener("change", handleChange)
      }
    }

    mediaQuery.addListener(handleChange)

    return () => {
      mediaQuery.removeListener(handleChange)
    }
  }, [])

  const resolvedTheme = appearance === "system" ? systemTheme : appearance

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
    document.documentElement.style.colorScheme = resolvedTheme
    window.localStorage.setItem(STORAGE_KEY, appearance)
  }, [appearance, resolvedTheme])

  const value = useMemo(
    () => ({
      appearance,
      resolvedTheme,
      setAppearance,
    }),
    [appearance, resolvedTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }

  return context
}
