import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { polyfillCountryFlagEmojis } from "country-flag-emoji-polyfill"
import flagFontUrl from "country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url"

import App from "./App.tsx"
import "./index.css"

// Self-hosted Twemoji country flag font (~76 KB woff2): loaded on demand only
// on platforms without native flag emoji rendering (e.g. Chromium on Windows).
polyfillCountryFlagEmojis("Twemoji Country Flags", flagFontUrl)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
