/// <reference types="vite/client" />

// Google Analytics 4, loaded only when the build sets VITE_GA_ID (e.g. G-XXXXXXXXXX) and never in dev.
const id = import.meta.env.VITE_GA_ID as string | undefined

declare global {
  interface Window {
    dataLayer: unknown[]
  }
}

export function initAnalytics(): void {
  if (!id || import.meta.env.DEV) return
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(script)
  window.dataLayer = window.dataLayer || []
  // gtag.js expects the arguments object itself, not an array
  function gtag(..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments)
  }
  gtag('js', new Date())
  gtag('config', id)
}
