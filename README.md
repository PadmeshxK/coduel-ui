# coduel — web

Frontend for **Coduel**, a real-time 1v1 coding-duel platform. React 19 + Vite + TypeScript +
Tailwind v4, with a Monaco-based code editor and a live duel over WebSocket (STOMP).

## Develop

```bash
npm install
npm run dev      # Vite dev server (default http://localhost:5173)
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
npm run lint     # eslint
```

The dev server talks to the Spring Boot backend (API base URL in `src/lib/config.ts`). The backend
must be running with CORS allowing this origin and Google OAuth2 configured.

## Structure

- `src/pages/` — routed screens (Lobby, Practice, Solve, Duel, Leaderboard, Profile, Login, Error).
- `src/components/` — `ui/` primitives, `layout/` shell, `editor/` the shared Monaco editor.
- `src/hooks/` — auth, theme, smooth scroll, match socket, async helpers.
- `src/lib/` — API client, config, small utilities.
- `src/index.css` — Tailwind v4 `@theme` tokens (the editorial light/dark design system).
