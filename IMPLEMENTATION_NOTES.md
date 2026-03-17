# Hugh Assistant — Sprint 2 Implementation Notes

## Created Files

### Root config
- `package.json` — Project deps: Next.js 15.5, AI SDK 6, NextAuth v5 beta, pg, zod, Tailwind CSS 4
- `tsconfig.json` — Strict mode, `@/*` path alias pointing to `./src/*`, bundler module resolution
- `next.config.ts` — `output: "standalone"`, `outputFileTracingRoot` set to project dir, `pg` in serverExternalPackages
- `next-env.d.ts` — Next.js TypeScript declarations
- `.env.example` — All required/optional env vars with descriptions
- `.gitignore` — node_modules, .next, .env files
- `Dockerfile` — Multi-stage build (deps → build → runner), runs as non-root `nextjs` user
- `docker-compose.yml` — 4 services: app, postgres (16-alpine), mcp-backend (taylorwilsdon/google_workspace_mcp:v1.8.0), caddy
- `Caddyfile` — Reverse proxy to app:3000 with `flush_interval -1` for streaming

### Source (`src/`)
- `auth.ts` — NextAuth v5 config: Google provider, `signIn` callback enforces `ALLOWED_EMAIL` allowlist
- `middleware.ts` — Protects `/api/chat/*` and `/api/status/*` routes via NextAuth middleware
- `app/layout.tsx` — Root layout with `<SessionProvider>` wrapper, Tailwind globals import
- `app/page.tsx` — Server component: renders `<Chat>` if authenticated, `<SignIn>` otherwise
- `app/globals.css` — Tailwind CSS 4 import
- `app/api/auth/[...nextauth]/route.ts` — NextAuth route handler (GET, POST)
- `app/api/chat/route.ts` — AI SDK 6 streaming chat: auth check → rate limit → extract user text → save to DB → build context → streamText with web_search tool → save assistant response → return UIMessageStreamResponse
- `app/api/status/route.ts` — Returns JSON with DB/MCP/model status
- `components/Chat.tsx` — Client component: `useChat` with `DefaultChatTransport`, status indicators, auto-scroll, streaming states, error display
- `components/SignIn.tsx` — Client component: Google SSO sign-in button
- `components/SignOutButton.tsx` — Client component: proper `signOut()` from `next-auth/react`
- `lib/ai/provider.ts` — Model configs (claude-sonnet-4-6, claude-haiku-4-5), Anthropic provider-defined `webSearch_20250305` tool, MCP config builder, system prompt
- `lib/context/builder.ts` — Sliding window (last 20 messages) with summary prepend
- `lib/context/summarizer.ts` — Haiku summarization when messages > 40 threshold, deletes old messages after summarizing
- `lib/db/schema.sql` — PostgreSQL schema: conversations, messages, summaries tables with indexes
- `lib/db/pool.ts` — `pg.Pool` singleton with connection check
- `lib/db/queries.ts` — Full CRUD: conversations, messages, summaries (get, create, save, delete, count)
- `lib/db/migrate.ts` — Migration runner (reads schema.sql, executes via pg)
- `lib/rateLimit.ts` — In-memory sliding window rate limiter (30 req/min per user)
- `lib/types.ts` — TypeScript interfaces for DB rows and status response

## Validation Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ Pass — zero errors |
| `npm run build` | ✅ Pass — produces `.next/standalone/server.js` |
| `docker compose build` | ⏭️ Skipped — Docker not available in build environment. Dockerfile and compose file are syntactically correct. |

## Assumptions & Deviations from Spec

1. **AI SDK versions updated**: The spec pins `@ai-sdk/react: "^2.0.0"` and `@ai-sdk/anthropic: "^1.2.0"`, but these are v5-era packages incompatible with `ai@^6.0.0`. Updated to `@ai-sdk/react: "^3.0.0"` and `@ai-sdk/anthropic: "^3.0.0"` (the `ai-v6` tagged releases). This is required for web search tool support and type compatibility.

2. **AI SDK 6 API changes**: `CoreMessage` → `ModelMessage`, `LanguageModelV1` → `LanguageModel`, `maxSteps` → `stopWhen: stepCountIs(5)`, `maxTokens` → `maxOutputTokens`, `toDataStreamResponse()` → `toUIMessageStreamResponse()`, `useChat` now uses `DefaultChatTransport` with `sendMessage()` and `parts`-based message rendering.

3. **MCP integration**: The MCP server config is built but not wired into `streamText` directly because AI SDK 6's `streamText` doesn't accept MCP server configs natively. The MCP integration would need the `@ai-sdk/mcp` adapter or a custom tool wrapper in Sprint 3. The status endpoint correctly reports MCP as `not_configured` when env vars are missing.

4. **Tailwind CSS 4**: Using `@import "tailwindcss"` syntax per Tailwind v4. No separate `tailwind.config.ts` needed.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude models |
| `AUTH_SECRET` | Yes | NextAuth session encryption secret |
| `AUTH_GOOGLE_ID` | Yes | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Yes | Google OAuth client secret |
| `ALLOWED_EMAIL` | Yes | Single allowed user email for sign-in |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `MCP_GOOGLE_WORKSPACE_URL` | No | MCP server URL (chat works without it) |
| `MCP_AUTH_TOKEN` | No | Bearer token for MCP server auth |

## Remaining Manual Google Cloud Steps

1. **Create Google Cloud Project** — Go to console.cloud.google.com, create a new project
2. **Enable Google OAuth** — APIs & Services → OAuth consent screen → configure for external users
3. **Create OAuth Credentials** — APIs & Services → Credentials → Create OAuth 2.0 Client ID → Web application
4. **Set Redirect URI** — Add `https://YOUR_DOMAIN/api/auth/callback/google` as authorized redirect URI
5. **Copy credentials** — Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in `.env.local`
6. **MCP setup** — If using Google Workspace MCP, configure separate OAuth credentials for the MCP server with appropriate Google API scopes (Drive, Gmail, Calendar, etc.)

## Sprint 3 Follow-ups

1. **MCP tool integration** — Wire `@ai-sdk/mcp` adapter into `streamText` for Google Workspace tools (Drive, Gmail, Calendar). Currently the config is prepared but not connected.
2. **Conversation management** — Add ability to create new conversations, list past conversations, and switch between them. Currently uses single most-recent conversation.
3. **Prompt caching** — Add `providerOptions` for Anthropic prompt caching on system blocks to reduce latency and cost on repeated system prompts.
4. **Markdown rendering** — Add `react-markdown` with syntax highlighting for assistant responses. Currently renders plain text.
5. **Production hardening** — Add health check endpoint, structured logging, error boundary component, and graceful shutdown handling.
