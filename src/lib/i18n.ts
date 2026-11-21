import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

import enUS from "@/locales/en-US.json"
import zhCN from "@/locales/zh-CN.json"

export type AppLocale = "zh-CN" | "en-US"

const LANG_STORAGE_KEY = "monitor:lang"

/** Normalizes any browser language tag (e.g. zh, zh-TW, en-GB) to a supported locale. */
export function normalizeLocale(lng?: string): AppLocale {
  return lng?.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US"
}

function syncDocumentLang(lng?: string) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = normalizeLocale(lng)
  }
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      "zh-CN": { translation: zhCN },
      "en-US": { translation: enUS },
    },
    supportedLngs: ["zh-CN", "en-US"],
    fallbackLng: "en-US",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ["localStorage"],
      convertDetectedLanguage: normalizeLocale,
    },
    interpolation: {
      escapeValue: false,
    },
  })

syncDocumentLang(i18n.resolvedLanguage ?? i18n.language)
i18n.on("languageChanged", syncDocumentLang)

export function toggleLocale() {
  const next: AppLocale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) === "zh-CN" ? "en-US" : "zh-CN"
  void i18n.changeLanguage(next)
}

export default i18n
