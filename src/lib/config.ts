/*
  Centralized runtime config — the single source of truth for environment-specific values.
  Nothing else in the app should hardcode a backend URL; import from here instead.

  Vite exposes only vars prefixed with VITE_ on import.meta.env, and bakes them in at
  build time. Override per-environment via .env files (see .env / .env.example):
    dev   -> .env                 (VITE_API_BASE_URL=http://localhost:8080/coduel)
    prod  -> build env / hosting  (VITE_API_BASE_URL=https://api.coduel.app/coduel)
  The ?? fallback keeps the app working even with no .env present.
*/
const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/coduel'

export const config = {
  /** Spring backend base — includes the /coduel context-path. */
  apiBaseUrl: API_BASE_URL,
  /** OAuth2 entry point — full-page redirect target for "Continue with Google". */
  googleLoginUrl: `${API_BASE_URL}/oauth2/authorization/google`,
  /** Native WebSocket (STOMP) endpoint for live match events — http(s) → ws(s). */
  wsUrl: `${API_BASE_URL.replace(/^http/, 'ws')}/ws`,
} as const
