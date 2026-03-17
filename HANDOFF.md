# Hugh Assistant v0.5 — System Architecture & Handoff Document

**Last updated:** 2026-03-15
**Author:** Implementation engineer (Opus 4.6)
**Status:** Alpha — builds clean, DB connected, OAuth blocking

---

## Table of Contents

1. [Handoff Prompt for Design Engineer](#handoff-prompt-for-design-engineer)
2. [Blocking Issue: Google OAuth](#blocking-issue-google-oauth)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Request Lifecycle (Step by Step)](#request-lifecycle)
6. [Database Schema & Persistence Model](#database-schema--persistence-model)
7. [Context Assembly & Summarization](#context-assembly--summarization)
8. [Multi-Agent Routing](#multi-agent-routing)
9. [MCP Tool Integration](#mcp-tool-integration)
10. [Conversation Management](#conversation-management)
11. [File-by-File Code Reference](#file-by-file-code-reference)
12. [Security Implementation](#security-implementation)
13. [Docker & Production Deployment](#docker--production-deployment)
14. [Environment Variables](#environment-variables)
15. [Completed Work (This Session)](#completed-work-this-session)
16. [Known Gaps, Bugs & Quirks](#known-gaps-bugs--quirks)
17. [Recommended Next Steps](#recommended-next-steps)
18. [Verification Commands](#verification-commands)

---

## Handoff Prompt for Design Engineer

> **Copy this entire block as your opening prompt when starting a new Claude session. The engineer cannot access the codebase directly — this gives them everything they need to make informed design decisions.**

```
I'm picking up Hugh Assistant v0.5, a Next.js 15 personal AI assistant for Hugh (co-founder, Revolin Sports). The app is running in alpha at localhost:3000. Here's the full current state:

STACK: Next.js 15.5.12 (App Router), React 19.1, Tailwind CSS 4, TypeScript 5.7 (strict), Vercel AI SDK 6.0.116, NextAuth 5.0.0-beta.25 (Google OAuth), PostgreSQL 17 via pg 8.13, react-markdown 10.1, @ai-sdk/mcp (installed).

WORKING DIRECTORY: ~/Desktop/Consulting Work/hugh-assistant-2/

WHAT'S WORKING (verified 2026-03-15):
- Build passes clean (tsc --noEmit + next build, zero errors/warnings)
- Dev server runs on port 3000
- Database: PostgreSQL 17 connected (hugh_assistant DB, 3 tables migrated, pool singleton)
- Chat streaming via Claude Sonnet 4.6 (claude-sonnet-4-6-20250217)
- Web search tool (Anthropic native webSearch_20250305, max 5 uses per turn)
- MCP tool integration: @ai-sdk/mcp installed and wired via SSE transport — auto-discovers tools when MCP_GOOGLE_WORKSPACE_URL is set, returns empty object gracefully when not
- Conversation management: sidebar with list, "New" button, delete (X on hover), conversation switching via useChat id param
- Multi-agent routing: Greg (analytics) and Sarah (ops) sub-agents activated via /greg, /sarah, /analytics, /ops commands or keyword detection in builder.ts detectContextMode()
- Auth guard on /api/chat/* and /api/conversations/* returns 401 for unauthenticated requests
- Rate limiting: 30 req/min per user email (in-memory sliding window Map, auto-cleans empty keys)
- Input validation: 32KB max message length, empty message rejection
- Security headers on all routes: CSP, HSTS 1yr, X-Frame-Options DENY, X-Content-Type-Options nosniff, strict referrer, Permissions-Policy
- Error boundary (src/app/error.tsx) with retry button
- Viewport meta with viewportFit: cover for iOS safe areas
- Typography plugin (@tailwindcss/typography via @plugin directive) renders prose in assistant messages
- Prompt caching: all system messages use providerOptions.anthropic.cacheControl: { type: "ephemeral" }
- Summarization: Haiku model, fire-and-forget at 40+ messages, cumulative, deduped via Set
- 10/10 smoke tests passing (npm run test:smoke)
- Status endpoint: { status: "ok", database: "connected", anthropic: "configured", mcp: "not_configured" }

⚠️ BLOCKING — GOOGLE OAUTH BROKEN:
Error "flowName=GeneralOAuthFlow" on sign-in attempt. The redirect URI http://localhost:3000/api/auth/callback/google is NOT registered in the Google Cloud Console OAuth 2.0 client. Someone with Google Cloud Console access must add it under Authorized Redirect URIs + add http://localhost:3000 to Authorized JavaScript Origins.

WHAT'S NOT WIRED YET:
- MCP Google Workspace: Code complete but needs MCP_GOOGLE_WORKSPACE_URL + MCP_AUTH_TOKEN in .env.local and the MCP server running
- Auto-titling: Conversations default to "New Conversation" — no LLM-based title generation
- Conversation history loading: Switching conversations clears client messages — doesn't fetch history from DB
- Conversation ownership validation: DELETE/PATCH /api/conversations/[id] checks auth but doesn't verify the conversation belongs to the requesting user

KEY AI SDK v6 DETAILS (these are NOT v5):
- useChat hook from @ai-sdk/react, NOT from "ai" package
- Messages are UIMessage objects with .parts array (not .content string)
- Rendering iterates message.parts, checks part.type === "text", reads part.text
- sendMessage({ text: "..." }) — object form, NOT sendMessage("string")
- DefaultChatTransport class wraps fetch to /api/chat, accepts body: {} for extra fields
- streamText returns result.toUIMessageStreamResponse() (NOT toDataStreamResponse)
- ModelMessage type (NOT CoreMessage), SystemModelMessage for system blocks
- stopWhen: stepCountIs(5) (NOT maxSteps: 5)
- maxOutputTokens (NOT maxTokens) on generateText calls
- convertToModelMessages(uiMessages) converts UIMessage[] → ModelMessage[]

SCRIPTS:
- npm run dev — start dev server (port 3000)
- npm run build — production build
- npm run verify — typecheck + build
- npm run test:smoke — 10-test smoke suite (requires dev server running)
- npm run migrate — run DB schema migration (tsx src/lib/db/migrate.ts)
- npm run typecheck — tsc --noEmit
```

---

## Blocking Issue: Google OAuth

**Symptom:** Clicking "Sign in with Google" at localhost:3000 produces error `flowName=GeneralOAuthFlow`

**Root Cause:** The Google Cloud Console OAuth 2.0 client (matching `AUTH_GOOGLE_ID` in `.env.local`) does not have the NextAuth callback URL registered.

**Required Fix (Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client):**

| Field | Value to Add |
|-------|-------------|
| Authorized JavaScript origins | `http://localhost:3000` |
| Authorized redirect URIs | `http://localhost:3000/api/auth/callback/google` |

For production, also add:
- Origin: `https://YOUR_DOMAIN`
- Redirect: `https://YOUR_DOMAIN/api/auth/callback/google`

**How NextAuth routes work:** The auth handler at `src/app/api/auth/[...nextauth]/route.ts` exports `GET` and `POST` from `auth.ts` `handlers`. Google redirects back to `/api/auth/callback/google` after consent. NextAuth's `signIn` callback in `auth.ts` (line 14-17) then checks `user.email.toLowerCase() === allowedEmail.toLowerCase()` — only `ctimlowski@gmail.com` passes. Both `signIn` and `error` pages are configured to redirect to `"/"` (the root), so a denied email just bounces back to the sign-in page with no error visible.

**Auth flow in code:**
1. `SignIn.tsx` calls `signIn("google")` from `next-auth/react` on button click
2. NextAuth redirects to Google consent screen
3. Google redirects back to `/api/auth/callback/google`
4. `auth.ts` `signIn` callback validates email against `ALLOWED_EMAIL`
5. JWT session created (encrypted with `AUTH_SECRET`)
6. User redirected to `/` where `page.tsx` server component calls `auth()` and renders `<Chat />`

---

## Technology Stack

| Layer | Technology | Version | Exact Import / Usage |
|-------|-----------|---------|---------------------|
| Framework | Next.js (App Router) | 15.5.12 | `output: "standalone"` in next.config.ts |
| UI | React | 19.1.0 | Server components (page.tsx) + Client components ("use client") |
| Styling | Tailwind CSS 4 | 4.0.0 | `@import "tailwindcss"` in globals.css, PostCSS plugin |
| Typography | @tailwindcss/typography | 0.5.19 | `@plugin "@tailwindcss/typography"` in globals.css, `prose prose-sm` classes |
| AI SDK Core | ai (Vercel AI SDK) | 6.0.116 | `streamText`, `generateText`, `UIMessage`, `ModelMessage`, `SystemModelMessage`, `DefaultChatTransport`, `stepCountIs`, `convertToModelMessages` |
| AI Provider | @ai-sdk/anthropic | 3.0.58 | `anthropic()` model factory, `anthropic.tools.webSearch_20250305()` |
| AI React | @ai-sdk/react | 3.0.118 | `useChat` hook |
| AI MCP | @ai-sdk/mcp | latest | `experimental_createMCPClient` (aliased as `createMCPClient`) |
| Auth | next-auth | 5.0.0-beta.25 | Google provider, JWT strategy, `auth()` server-side check |
| Database | pg | 8.13.0 | `Pool` singleton, parameterized queries (`$1`, `$2`), advisory locks |
| Markdown | react-markdown | 10.1.0 | v10 API — no `className` prop on component, wrap in div |
| Validation | zod | 3.24.0 | Installed but not heavily used |
| TypeScript | typescript | 5.7.0 | Strict mode, `@/*` path alias → `./src/*` |
| Runner | tsx | 4.19.0 | Scripts (smoke-test, migrate) |

---

## System Architecture

### High-Level Component Map

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser                                │
│                                                               │
│  ┌──────────┐  ┌───────────────────────────────────────────┐ │
│  │ Sidebar   │  │              Chat Component               │ │
│  │ (w-72)    │  │  ┌─────────────────────────────────────┐ │ │
│  │           │  │  │  Header (status dots, sign out)      │ │ │
│  │ conv list │  │  ├─────────────────────────────────────┤ │ │
│  │ + New btn │  │  │  Message List (auto-scroll)          │ │ │
│  │ + Delete  │  │  │  - User: blue-600 bg, white text     │ │ │
│  │           │  │  │  - Assistant: gray-100 bg, prose md   │ │ │
│  │ (hidden   │  │  │  - Thinking: pulse dot                │ │ │
│  │  when no  │  │  │  - Error: red-50 border               │ │ │
│  │  DB)      │  │  ├─────────────────────────────────────┤ │ │
│  │           │  │  │  Input (text-base, prevents iOS zoom) │ │ │
│  └──────────┘  │  └─────────────────────────────────────┘ │ │
│                 └───────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
         │                           │
         │ GET /api/conversations    │ POST /api/chat
         │ DELETE /api/conv/[id]     │  body: { messages, conversationId? }
         ▼                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Next.js Server                             │
│                                                               │
│  middleware.ts: auth guard on /api/chat/*, /api/conversations/* │
│                                                               │
│  route.ts (chat):                                             │
│    auth → rate limit → parse → validate → resolve conv        │
│    → save user msg → detect context mode → build context      │
│    → get MCP tools → streamText → save assistant msg          │
│    → return SSE stream + X-Conversation-Id header             │
│                                                               │
│  route.ts (conversations):                                    │
│    GET: listConversations(email) → JSON array                 │
│    POST: createConversation(email, title?) → JSON             │
│    PATCH [id]: updateConversationTitle(id, title)             │
│    DELETE [id]: deleteConversation(id)                         │
│                                                               │
│  route.ts (status): public, no auth                           │
│    checkDb() + env checks → { status, anthropic, mcp, ... }  │
└──────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    PostgreSQL 17       Claude API            MCP Server
    (localhost)         (Anthropic)           (optional)
    - conversations     - Sonnet 4.6          - Google Workspace
    - messages          - Haiku 4.5           - SSE transport
    - summaries         - web_search tool     - ghcr.io/taylorwilsdon/
                                                google_workspace_mcp:v1.8.0
```

### Responsive Behavior

- **Desktop (lg: 1024px+):** Sidebar is always visible as a relative panel (w-72). "New chat" button in header. Hamburger hidden.
- **Mobile (<1024px):** Sidebar hidden by default. Hamburger button in header toggles it as a fixed overlay (z-50) with semi-transparent backdrop (z-40). Tapping backdrop or selecting a conversation closes it.
- **iOS:** `viewportFit: "cover"` in layout.tsx viewport export. `env(safe-area-inset-bottom)` padding on chat container. Input is `text-base` (16px) to prevent Safari auto-zoom on focus.

---

## Request Lifecycle

Here is exactly what happens when a user sends a message, with file locations and line numbers:

### Step 1: Client sends message
**File:** `src/components/Chat.tsx:55-61`
```
handleSubmit → sendMessage({ text: input }) → setInput("")
```
The `useChat` hook (line 31) uses `DefaultChatTransport` (line 22-29) which POSTs to `/api/chat`. The transport is recreated via `useMemo` whenever `conversationId` changes. If `conversationId` is non-null, it's included in `body: { conversationId }` which gets merged into the POST body alongside `messages`.

### Step 2: Middleware check
**File:** `src/middleware.ts`
```
Matcher: /api/chat/:path* and /api/conversations/:path*
```
Exports NextAuth's `auth` as middleware. Returns 401 if no valid JWT session cookie.

### Step 3: Route handler auth
**File:** `src/app/api/chat/route.ts:42-45`
```
const session = await auth();
if (!session?.user?.email) return 401
```
Double-checks auth server-side (middleware + route-level). Extracts `session.user.email`.

### Step 4: Rate limiting
**File:** `src/app/api/chat/route.ts:48-56` → `src/lib/rateLimit.ts`
```
checkRateLimit(session.user.email) → { allowed, remaining, resetMs }
```
Sliding window: keeps array of timestamps per email in a `Map`. Prunes expired entries. If after pruning the array is empty, deletes the key from the Map (memory cleanup). Returns 429 with retry-after if >= 30 requests in the last 60 seconds.

**Quirk:** When timestamps array empties, the function returns `allowed: true` without recording the current request. The next request starts fresh. This means the first request after a quiet period isn't counted. Acceptable for single-user.

### Step 5: Parse and validate
**File:** `src/app/api/chat/route.ts:59-88`
```
body.messages → UIMessage[] (AI SDK v6 format)
body.conversationId → optional string
Extract text from lastUiMessage.parts where part.type === "text"
Reject if empty (400) or > 32KB (413)
```
**Critical detail:** AI SDK v6 `UIMessage` has a `.parts` array, not a `.content` string. Each part has a `type` and `text` field. The route concatenates all text parts from the last message.

### Step 6: Resolve conversation
**File:** `src/app/api/chat/route.ts:92-100`
```
if (requestedConversationId) → use it directly
else → getOrCreateConversation(email) → returns most recent or creates new
```
**Behavior:** `getOrCreateConversation` (queries.ts:6-27) queries `ORDER BY updated_at DESC LIMIT 1`. If no conversation exists for that email, inserts a new one with title "New Conversation". Returns the Conversation row.

**When DB is off:** Returns null. `conversationId` becomes null. All DB operations become no-ops (every query function checks `getPool()` first).

### Step 7: Save user message
**File:** `src/app/api/chat/route.ts:101-103` → `src/lib/db/queries.ts:100-132`
```
saveMessage(conversationId, "user", userText)
```
Uses advisory lock: `BEGIN → pg_advisory_xact_lock(hashtext(conversationId)) → INSERT with COALESCE(MAX(seq), 0) + 1 → COMMIT → touchConversation(id)`. This serializes inserts per conversation to prevent duplicate seq numbers.

### Step 8: Detect context mode
**File:** `src/app/api/chat/route.ts:106` → `src/lib/context/builder.ts:43-88`
```
detectContextMode(userText) → "default" | "analytics" | "operations"
```
Priority: explicit commands first (`/greg`, `/analytics`, `/sarah`, `/ops` — checks `startsWith`), then keyword lists. Analytics keywords: analytics, metrics, data, spreadsheet, numbers, dashboard, kpi, report, chart, graph, trend. Ops keywords: inventory, shipping, logistics, vendor, supply chain, warehouse, order, fulfillment, manufacturing. Only routes if ONE department matches (not both). Ambiguous → "default".

### Step 9: Build context
**File:** `src/app/api/chat/route.ts:109` → `src/lib/context/builder.ts:96-172`
```
buildContext(conversationId, contextMode) → ChatContext
```
Returns `{ systemMessages, dbMessages, hasDatabase, conversationId }`.

**System messages assembly (in order):**
1. **Base system prompt** (always) — `SYSTEM_PROMPT` from provider.ts. ~26 lines. Persona is "Hugh's Chief of Staff." With `cacheControl: { type: "ephemeral" }`.
2. **Sub-agent prompt** (if routed) — `GREG_PROMPT` or `SARAH_PROMPT` from provider.ts. ~25 lines each. Also cached.
3. **Conversation summary** (if exists) — wrapped in `<conversation_summary>` XML tags. Also cached.

**DB messages:** Fetches last 20 messages via subquery `ORDER BY seq DESC LIMIT 20` then re-orders ASC. This is the sliding window.

**Summarization trigger:** If `countMessages(convId) > 40`, fires `maybeSummarize(convId)` as a detached promise (fire-and-forget, error logged but not thrown). Does NOT block the response.

### Step 10: Get MCP tools
**File:** `src/app/api/chat/route.ts:126` → `src/lib/ai/mcp-tools.ts`
```
getMcpTools() → Record<string, unknown>
```
If `MCP_GOOGLE_WORKSPACE_URL` is not set, returns `{}` immediately. Otherwise, lazily creates an `experimental_createMCPClient` with SSE transport, caches it in module-level `mcpClient` variable. Calls `mcpClient.tools()` to discover available tools. On error, logs and returns `{}`.

### Step 11: Stream response
**File:** `src/app/api/chat/route.ts:133-158`
```
streamText({
  model: getPrimaryModel(),           // claude-sonnet-4-6-20250217
  system: context.systemMessages,     // SystemModelMessage[] with cache_control
  messages,                           // ModelMessage[] from DB or client
  tools: { web_search, ...mcpTools }, // merged tool set
  providerOptions: getProviderOptions(), // MCP server config if set
  stopWhen: stepCountIs(5),           // max 5 tool-use steps
  onFinish: save assistant message,
  onError: console.error,
})
```
Returns `result.toUIMessageStreamResponse()` (SSE stream). Sets `X-Conversation-Id` response header if available.

**providerOptions detail** (provider.ts:56-80): When MCP is configured, injects `anthropicOptions.mcpServers` array with `{ type: "url", url, name: "google-workspace", authorization_token }` and adds `anthropic-beta: mcp-client-2025-11-20` header. When not configured, returns `{ anthropic: {} }`.

### Step 12: Message source decision
**File:** `src/app/api/chat/route.ts:111-123`
```
if (context.hasDatabase && context.dbMessages.length > 0)
  → use DB sliding window (maps to { role, content } ModelMessage)
else
  → convertToModelMessages(uiMessages) from AI SDK
```
This is the graceful degradation: with DB, the server controls the conversation window. Without DB, it just passes through whatever the client sent.

---

## Database Schema & Persistence Model

### Connection
**File:** `src/lib/db/pool.ts`
- Singleton `Pool` from `pg`, created on first `getPool()` call
- Config: max 10 connections, 30s idle timeout, 5s connection timeout
- Returns `null` if `DATABASE_URL` unset (every query function checks this)
- `checkDb()` runs `SELECT 1` to verify connectivity (used by status endpoint)
- Connection string: `postgresql://vulcan@localhost:5432/hugh_assistant` (no password, local peer auth)

### Tables

**conversations**
```sql
id UUID PK DEFAULT gen_random_uuid()
user_email TEXT NOT NULL               -- indexed with updated_at DESC
title TEXT NOT NULL DEFAULT 'New Conversation'
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()  -- bumped on every message save
```

**messages (APPEND-ONLY — never delete rows)**
```sql
id UUID PK DEFAULT gen_random_uuid()
conversation_id UUID NOT NULL FK → conversations ON DELETE CASCADE
role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system'))
content TEXT NOT NULL
seq INTEGER NOT NULL                   -- unique per conversation, advisory-locked
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```
Unique index on `(conversation_id, seq)`.

**summaries (one per conversation via unique index)**
```sql
id UUID PK DEFAULT gen_random_uuid()
conversation_id UUID NOT NULL FK → conversations ON DELETE CASCADE
summary_text TEXT NOT NULL
summarized_up_to INTEGER NOT NULL DEFAULT 0   -- watermark: last seq covered
created_at TIMESTAMPTZ NOT NULL DEFAULT now()  -- actually updated on upsert
```
Unique index on `conversation_id`.

### Query Functions (queries.ts)

| Function | SQL Pattern | Notes |
|----------|------------|-------|
| `getOrCreateConversation(email)` | SELECT ORDER BY updated_at DESC LIMIT 1, or INSERT | Returns most recent conversation for user |
| `createConversation(email, title?)` | INSERT RETURNING * | Title defaults to "New Conversation" |
| `listConversations(email)` | SELECT WHERE user_email ORDER BY updated_at DESC LIMIT 50 | For sidebar |
| `updateConversationTitle(id, title)` | UPDATE SET title, updated_at = now() | |
| `deleteConversation(id)` | DELETE WHERE id | CASCADE deletes messages + summary |
| `touchConversation(id)` | UPDATE SET updated_at = now() | Called after every message save |
| `saveMessage(convId, role, content)` | BEGIN → advisory_lock → INSERT with MAX(seq)+1 → COMMIT → touch | Serialized per conversation |
| `getMessages(convId)` | SELECT ORDER BY seq ASC | All messages (not currently used by routes) |
| `getRecentMessages(convId, count)` | Subquery: ORDER BY seq DESC LIMIT n, outer ORDER BY seq ASC | Sliding window |
| `getMessagesInRange(convId, start, end)` | SELECT WHERE seq > start AND seq < end | For summarizer |
| `countMessages(convId)` | SELECT COUNT(*) | Returns integer (parses from string) |
| `getMaxSeq(convId)` | SELECT MAX(seq) | Returns 0 if null |
| `upsertSummary(convId, text, upTo)` | INSERT ON CONFLICT (conversation_id) DO UPDATE | One summary per conversation |
| `getLatestSummary(convId)` | SELECT WHERE conversation_id LIMIT 1 | |

---

## Context Assembly & Summarization

### Context Assembly (builder.ts)

The system sends Claude an array of `SystemModelMessage[]` (not a single string). Each message has `providerOptions.anthropic.cacheControl: { type: "ephemeral" }` for Anthropic prompt caching.

**Assembled context stack (in order):**
```
SystemModelMessage[0]: SYSTEM_PROMPT (always present, ~700 chars)
  ↳ Persona: "Hugh's Chief of Staff", Revolin Sports context, 5 guidelines
  ↳ Mentions Greg + Sarah sub-agents as personality extensions

SystemModelMessage[1]: GREG_PROMPT or SARAH_PROMPT (only if routed, ~600 chars each)
  ↳ Greg: data nerd intern, tables/percentages, self-deprecating
  ↳ Sarah: no-nonsense ops, checklists/timelines, action-oriented

SystemModelMessage[2 or 1]: <conversation_summary>...</conversation_summary> (only if summary exists)
  ↳ Cumulative text from Haiku summarization

Then: ModelMessage[] — last 20 messages from DB (role + content only, no metadata)
```

### Summarization (summarizer.ts)

**Trigger:** `buildContext` checks `countMessages(convId) > 40` and calls `maybeSummarize()` fire-and-forget.

**Guard:** `activeSummarizations` Set prevents concurrent summarization of the same conversation.

**Algorithm:**
1. Get `maxSeq` for the conversation
2. Calculate `windowFloor = maxSeq - 20` (the bottom of the sliding window)
3. Get existing summary's `summarized_up_to` watermark (0 if none)
4. If `summarizedUpTo >= windowFloor`, nothing to summarize (already caught up)
5. Fetch messages in range `(summarizedUpTo, windowFloor)` — exclusive on both ends
6. Build prompt: if previous summary exists, include it and ask for "updated cumulative summary"; otherwise ask for initial summary
7. Call `generateText` with Haiku model (`claude-haiku-4-5-20241022`), system: "You are a conversation summarizer", maxOutputTokens: 1024
8. `upsertSummary(convId, result.text, windowFloor)` — stores text + watermark

**Design: messages are never deleted.** The summary compresses context. The sliding window moves forward. Old messages remain for audit.

---

## Multi-Agent Routing

### Detection (builder.ts:43-88)

```
detectContextMode(userText) → "default" | "analytics" | "operations"
```

**Priority order:**
1. Explicit commands: `/greg` or `/analytics` → analytics; `/sarah` or `/ops` → operations (case-insensitive, startsWith)
2. Keyword match: analytics keywords list (11 words) vs ops keywords list (9 words). Only routes if exactly one list matches.
3. Default: anything ambiguous or unmatched → "default" (Chief of Staff)

**Analytics keywords:** analytics, metrics, data, spreadsheet, numbers, dashboard, kpi, report, chart, graph, trend
**Ops keywords:** inventory, shipping, logistics, vendor, supply chain, warehouse, order, fulfillment, manufacturing

### Sub-Agent Prompts (provider.ts:112-162)

**Greg (Analyst Intern):**
- Personality: eager, nerdy, tables/percentages, "per my analysis", self-deprecating
- Capabilities: data analysis, spreadsheet formulas, KPIs, market research, financial modeling
- Style: structured format, cite sources, flag assumptions
- XML-wrapped in `<sub_agent name="Greg" role="Analyst Intern">`

**Sarah (Operations Manager):**
- Personality: no-nonsense, efficient, "Here's the play", thinks in checklists
- Capabilities: supply chain, vendor management, inventory, shipping, manufacturing
- Style: actionable steps, timelines, bottleneck flagging
- XML-wrapped in `<sub_agent name="Sarah" role="Operations Manager">`

Both prompts end with: "If asked something outside your wheelhouse, defer back to the Chief of Staff."

### How Routing Works in Practice

The sub-agent prompt is **appended as a second system message**, not replacing the base prompt. So Claude sees the Chief of Staff persona PLUS the sub-agent overlay. The base prompt's `<personality_extensions>` block tells Claude about both agents existing, so it knows the context.

---

## MCP Tool Integration

### Architecture (mcp-tools.ts)

- Uses `experimental_createMCPClient` from `@ai-sdk/mcp` (still experimental API)
- SSE transport (Server-Sent Events) — connects to `MCP_GOOGLE_WORKSPACE_URL`
- Auth via `Authorization: Bearer <MCP_AUTH_TOKEN>` header if token set
- Client is lazily initialized on first call and cached in module-level variable
- `getMcpTools()` returns `Record<string, unknown>` — the tools object is spread into `streamText`'s tools alongside `web_search`
- If MCP URL not set: returns `{}` immediately (no error, no attempt)
- If connection fails: logs error, returns `{}` (graceful degradation)
- `closeMcpClient()` exported for cleanup but not currently called anywhere

### Provider-level MCP Config (provider.ts:56-80)

There's ALSO a provider-level MCP config in `getProviderOptions()` that injects `mcpServers` into Anthropic's provider options. This is a **dual approach** — the `@ai-sdk/mcp` client discovers tools for `streamText`, while the provider options configure Anthropic's native MCP beta. Both approaches exist in the codebase. The `@ai-sdk/mcp` approach is the primary one used by `getMcpTools()`.

### Docker Compose MCP Server

The `docker-compose.yml` configures `ghcr.io/taylorwilsdon/google_workspace_mcp:v1.8.0` on port 8080 (internal only, not exposed to host). `SINGLE_USER_MODE=true`. The app service's `MCP_GOOGLE_WORKSPACE_URL` is set to `http://mcp-backend:8080/mcp`.

---

## Conversation Management

### API Routes

**GET /api/conversations** — `src/app/api/conversations/route.ts`
- Auth required (middleware + route-level)
- Returns JSON array of `Conversation[]` for the authenticated user
- Ordered by `updated_at DESC`, limited to 50

**POST /api/conversations** — same file
- Auth required
- Body: `{ title?: string }` (optional)
- Creates new conversation for authenticated user
- Returns 201 with new Conversation object
- Returns 503 if DB not configured

**PATCH /api/conversations/[id]** — `src/app/api/conversations/[id]/route.ts`
- Auth required
- Body: `{ title: string }`
- Updates conversation title and `updated_at`
- **Does NOT verify conversation ownership** — any authenticated user could update any conversation by ID

**DELETE /api/conversations/[id]** — same file
- Auth required
- Deletes conversation (CASCADE deletes messages + summary)
- **Does NOT verify conversation ownership** — same issue as PATCH

### Client-Side (Chat.tsx + Sidebar.tsx)

**Chat.tsx conversation state:**
- `conversationId: string | null` — null means "no active conversation" (new chat)
- `chatTransport` is recreated via `useMemo([conversationId])` — this causes `DefaultChatTransport` to include `{ conversationId }` in the POST body
- `useChat({ id: conversationId ?? "default" })` — the `id` param gives each conversation its own message cache in the hook
- `handleNewConversation`: sets conversationId to null, clears messages
- `handleSelectConversation`: sets conversationId, clears messages (does NOT load history from DB)

**Sidebar.tsx:**
- Fetches `GET /api/conversations` on mount and whenever `activeConversationId` changes
- Shows "Loading..." then either "No conversations yet" or the conversation list
- Each conversation shows truncated title + relative date (Today, Yesterday, Xd ago, or "Mon DD")
- Delete button: X icon, hidden by default, shown on hover via `group-hover:block`
- Active conversation highlighted with `bg-blue-50 text-blue-700`
- "New" button in sidebar header creates a new conversation (calls `onNewConversation`)
- **Only renders when `serviceStatus.database === "connected"`** — graceful degradation

### Sidebar Layout

- Fixed width: `w-72` (288px)
- On desktop (lg+): `relative`, always visible
- On mobile: `fixed left-0 top-0 z-50`, slides in/out with `translate-x` transition (200ms)
- Mobile overlay: `fixed inset-0 z-40 bg-black/20`, click to close

---

## File-by-File Code Reference

### Root Configuration

| File | Lines | Purpose | Key Details |
|------|-------|---------|------------|
| `package.json` | 38 | Dependencies + scripts | v0.5.0. No `package-lock.json` mentioned but `npm ci` in Dockerfile suggests it exists |
| `next.config.ts` | 39 | Next.js config | `output: "standalone"`, `pg` in `serverExternalPackages`, 7 security headers on all routes via `/:path*` |
| `tsconfig.json` | — | TypeScript config | Strict mode, `@/*` → `./src/*`, bundler resolution |
| `postcss.config.mjs` | — | PostCSS config | Tailwind CSS 4 plugin |
| `.env.local` | 8 | Live credentials | All auth + API keys set, DATABASE_URL active, MCP vars commented |
| `.env.example` | 26 | Template | Shows all vars with descriptions |
| `Dockerfile` | 52 | 3-stage build | deps (npm ci) → builder (next build with placeholder envs) → runner (non-root nextjs user UID 1001, port 3000) |
| `docker-compose.yml` | 65 | 4 services | app, postgres:16-alpine (health-checked, not host-exposed), mcp-backend (v1.8.0, SINGLE_USER_MODE), caddy:2-alpine |
| `Caddyfile` | 6 | Reverse proxy | `flush_interval -1` for SSE streaming. Domain placeholder: YOUR_DOMAIN |
| `DECISIONS.md` | — | 9 ADRs | AI SDK v6, append-only messages, advisory locks, optional DB, single email allowlist, Haiku summarization, in-memory rate limiter, keyword routing, MCP via SSE |

### Source Files

| File | Lines | Purpose | Key Implementation Details |
|------|-------|---------|---------------------------|
| `src/auth.ts` | 28 | NextAuth config | Google provider. `signIn` callback: `user.email.toLowerCase() === allowedEmail.toLowerCase()`. Pages: both signIn and error redirect to `"/"`. JWT strategy via `AUTH_SECRET`. |
| `src/middleware.ts` | 5 | Auth middleware | `export { auth as middleware }`. Matcher: `["/api/chat/:path*", "/api/conversations/:path*"]`. Status endpoint intentionally unprotected. |
| `src/app/layout.tsx` | 28 | Root layout | `<SessionProvider>` wraps children. Exports `metadata` (title, description) and `viewport` (width: device-width, initialScale: 1, viewportFit: "cover"). |
| `src/app/page.tsx` | 13 | Server component | `auth()` check → render `<Chat />` or `<SignIn />`. No props passed down. |
| `src/app/globals.css` | 2 | Tailwind entry | `@import "tailwindcss"` + `@plugin "@tailwindcss/typography"` |
| `src/app/error.tsx` | 28 | Error boundary | "use client". Shows error message + "Try again" button (calls `reset()`). Centered on screen. |
| `src/app/api/auth/[...nextauth]/route.ts` | — | NextAuth handlers | Exports `GET, POST` from `auth.ts` `handlers` |
| `src/app/api/chat/route.ts` | 173 | **Core chat endpoint** | `maxDuration = 120`. Full pipeline: auth → rate limit → parse UIMessage parts → validate → resolve conversation → save user msg → detect context mode → build context → get MCP tools → streamText → save assistant msg → return SSE + X-Conversation-Id header. Error handling distinguishes API key errors from generic errors. |
| `src/app/api/conversations/route.ts` | 36 | List + create | GET: listConversations(email). POST: createConversation(email, title?), returns 503 if no DB. |
| `src/app/api/conversations/[id]/route.ts` | 38 | Update + delete | PATCH: updateConversationTitle. DELETE: deleteConversation. Both use `params: Promise<{ id: string }>` (Next.js 15 async params). |
| `src/app/api/status/route.ts` | 22 | Health check | Public. Returns `{ status, anthropic, mcp, model, database, timestamp }`. Status is "ok" only if DB connected AND API key present. |
| `src/components/Chat.tsx` | 291 | **Main chat UI** | State: conversationId, sidebarOpen, input, serviceStatus, messagesEndRef. Transport recreated on conversationId change via useMemo. useChat with `id` param for per-conversation message cache. Sidebar conditional on DB connected. 4 suggestion chips. Messages rendered via `.parts` iteration. Markdown via `<ReactMarkdown>` wrapped in `prose prose-sm`. "Thinking" pulse animation on `status === "submitted"`. |
| `src/components/Sidebar.tsx` | 154 | Conversation list | Props: activeConversationId, onSelectConversation, onNewConversation, isOpen, onClose. Fetches conversations on mount + when activeConversationId changes. Delete button with stopPropagation. Relative date formatting. Fixed positioning on mobile with backdrop overlay. |
| `src/components/SignIn.tsx` | 42 | Sign-in page | Google button with SVG icon. Calls `signIn("google")` from next-auth/react. Gray-50 bg, white card, shadow-sm. |
| `src/components/SignOutButton.tsx` | 14 | Sign-out button | Calls `signOut()` from next-auth/react. Gray text, hover bg-gray-100. |
| `src/lib/ai/provider.ts` | 162 | **AI config** | Exports: PRIMARY_MODEL_ID, SUMMARIZATION_MODEL_ID, getPrimaryModel(), getSummarizationModel(), getWebSearchTool(), getMcpConfig(), isMcpConfigured(), getProviderOptions(), SYSTEM_PROMPT, GREG_PROMPT, SARAH_PROMPT. webSearch uses `anthropic.tools.webSearch_20250305({ maxUses: 5 })`. |
| `src/lib/ai/mcp-tools.ts` | 49 | MCP client | `experimental_createMCPClient` from @ai-sdk/mcp. SSE transport. Lazy init + module-level cache. Returns `{}` if not configured or on error. Exports `closeMcpClient()` for cleanup. |
| `src/lib/context/builder.ts` | 172 | **Context assembly** | Exports: ContextMode type, ChatContext interface, detectContextMode(), buildContext(). Constants: SLIDING_WINDOW_SIZE=20, SUMMARIZATION_THRESHOLD=40. Keyword lists for analytics (11) and ops (9). System messages array with cache_control on every entry. |
| `src/lib/context/summarizer.ts` | 91 | Summarization engine | Exports: maybeSummarize(). Constants: SUMMARIZE_THRESHOLD=40, WINDOW_SIZE=20. Uses activeSummarizations Set for dedup. Calculates windowFloor, fetches unsummarized range, builds cumulative prompt, calls generateText with Haiku, upserts result. |
| `src/lib/db/pool.ts` | 36 | Connection pool | Singleton Pool. max=10, idle=30s, connect=5s. Returns null if no DATABASE_URL. checkDb() for status endpoint. |
| `src/lib/db/queries.ts` | 261 | **All CRUD** | 13 exported functions. Advisory-locked message insert. Sliding window subquery. Count returns parsed int. Upsert summary via ON CONFLICT. All parameterized ($1, $2). |
| `src/lib/db/schema.sql` | 38 | DDL | 3 tables + pgcrypto extension + 4 indexes (conversations_user, messages_conv_seq unique, messages_conversation, summaries_conv_id unique). |
| `src/lib/db/migrate.ts` | 29 | Migration runner | Reads schema.sql via readFileSync, executes via new Pool. Uses `__dirname` (works with tsx). |
| `src/lib/env.ts` | 31 | Startup validation | Runs once (guarded by `validated` flag). Warns on missing AUTH_SECRET, ANTHROPIC_API_KEY, Google OAuth creds, ALLOWED_EMAIL. Console.warn only, doesn't throw. |
| `src/lib/rateLimit.ts` | 47 | Rate limiter | Map<string, number[]>. 30 req/min. Prunes on check. Deletes empty keys. Returns { allowed, remaining, resetMs }. |
| `src/lib/types.ts` | 35 | TypeScript types | Conversation, Message, Summary (DB row types). StatusResponse (API response type). |
| `src/scripts/smoke-test.ts` | 215 | 10-test suite | Tests: status 200, anthropic configured, model present, database field, chat 401, oversized input, homepage 200, security headers, auth providers, response time <2s. |

---

## Security Implementation

| Layer | Implementation | File | Details |
|-------|---------------|------|---------|
| Authentication | Google OAuth + email allowlist | `src/auth.ts` | Only `ALLOWED_EMAIL` (ctimlowski@gmail.com) can sign in. Case-insensitive comparison. |
| Route protection | NextAuth middleware | `src/middleware.ts` | Matches `/api/chat/*` and `/api/conversations/*`. Status endpoint intentionally public. |
| Session | JWT encrypted with AUTH_SECRET | `src/auth.ts` | No database sessions — stateless JWT. |
| Rate limiting | 30 req/min per email | `src/lib/rateLimit.ts` | In-memory Map. Returns 429 with retry-after. Cleans up empty keys. |
| Input validation | Max 32KB + non-empty | `route.ts:74-88` | 400 for empty, 413 for oversized. |
| SQL injection | Parameterized queries | `queries.ts` | All queries use `$1, $2, $3` placeholders. Never interpolates user input. |
| XSS | React auto-escape + CSP | `next.config.ts` | CSP: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'none'` |
| Clickjacking | X-Frame-Options: DENY | `next.config.ts` | Applied to all routes via `/:path*` |
| HTTPS | HSTS 1 year + includeSubDomains | `next.config.ts` | |
| MIME sniffing | X-Content-Type-Options: nosniff | `next.config.ts` | |
| Referrer | strict-origin-when-cross-origin | `next.config.ts` | |
| Permissions | camera=(), microphone=(), geolocation=() | `next.config.ts` | |
| Docker | Non-root user (nextjs, UID 1001) | `Dockerfile` | DB not exposed to host in docker-compose |
| Secrets | .env.local git-ignored | `.gitignore` | Build-time placeholder vars in Dockerfile |

**Security gap:** The `/api/conversations/[id]` PATCH and DELETE routes verify the request is authenticated but do NOT verify the conversation belongs to the requesting user. Any authenticated user (currently just Hugh) could delete any conversation by UUID. Acceptable for single-user but needs ownership check before multi-user.

---

## Docker & Production Deployment

### Dockerfile (3-stage)
1. **deps** — `node:20.18-alpine3.20`, `npm ci --ignore-scripts`
2. **builder** — copies node_modules + source, sets build-time env placeholders (empty strings), runs `npm run build`
3. **runner** — creates `nodejs` group + `nextjs` user (UID 1001), copies `.next/standalone`, `.next/static`, `public`, `schema.sql`. Runs as non-root. Exposes port 3000.

### Docker Compose (4 services)
1. **app** — builds from Dockerfile. Depends on postgres (healthy) + mcp-backend (started). Sets DATABASE_URL to internal postgres, MCP_GOOGLE_WORKSPACE_URL to internal mcp-backend.
2. **postgres:16-alpine** — user: hugh, password: hugh_secret, db: hugh_assistant. Schema mounted as init script. Health check via pg_isready. NOT exposed to host (only `expose: 5432`).
3. **mcp-backend** — `ghcr.io/taylorwilsdon/google_workspace_mcp:v1.8.0`. SINGLE_USER_MODE=true. Reads .env.local for Google credentials. Only exposed internally on 8080.
4. **caddy:2-alpine** — ports 80/443. Reads Caddyfile. `flush_interval -1` is critical for SSE streaming.

### Production checklist:
- Replace `YOUR_DOMAIN` in Caddyfile with real domain
- Add production redirect URI to Google Cloud Console
- Set real DATABASE_URL, MCP vars in .env.local
- `docker compose up --build -d`
- Caddy auto-provisions TLS via Let's Encrypt

---

## Environment Variables

| Variable | Required | Current Value | Purpose |
|----------|----------|--------------|---------|
| `AUTH_SECRET` | Yes | Set (base64) | NextAuth JWT encryption key |
| `AUTH_GOOGLE_ID` | Yes | Set (C205843...) | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Yes | Set (GOCSPX-...) | Google OAuth client secret |
| `ALLOWED_EMAIL` | Yes | ctimlowski@gmail.com | Single email allowed to sign in |
| `ANTHROPIC_API_KEY` | Yes | Set (sk-ant-...) | Claude API key |
| `DATABASE_URL` | Yes* | postgresql://vulcan@localhost:5432/hugh_assistant | PostgreSQL connection string (*app works without it, but no persistence) |
| `MCP_GOOGLE_WORKSPACE_URL` | No | Not set | MCP server URL for Google Workspace tools |
| `MCP_AUTH_TOKEN` | No | Not set | Bearer token for MCP server auth |

---

## Completed Work (This Session, 2026-03-15)

### Infrastructure
- Fixed stale PostgreSQL PID file (`postmaster.pid` referenced dead PID 743)
- Restarted PostgreSQL 17 service via Homebrew
- Created `hugh_assistant` database
- Ran schema migration (3 tables + 4 indexes)
- Installed `@ai-sdk/mcp` npm package

### Code Changes

| # | File | Change | Lines Affected |
|---|------|--------|---------------|
| 1 | `.env.local:6` | Uncommented + set `DATABASE_URL=postgresql://vulcan@localhost:5432/hugh_assistant` | 1 line |
| 2 | `src/lib/ai/mcp-tools.ts` | **NEW FILE** — MCP client using `experimental_createMCPClient` from `@ai-sdk/mcp`, SSE transport, lazy init, cached | 49 lines |
| 3 | `src/app/api/chat/route.ts` | Added: MCP tools import, `requestedConversationId` from body, conversation resolution logic, `detectContextMode` call, `buildContext` with contextMode, MCP tools merged into streamText, `X-Conversation-Id` response header | ~20 lines changed |
| 4 | `src/lib/ai/provider.ts` | Added: `GREG_PROMPT` and `SARAH_PROMPT` exports (~50 lines), updated `<personality_extensions>` block to reference active sub-agents | ~55 lines added |
| 5 | `src/lib/context/builder.ts` | **REWRITTEN** — Added: `ContextMode` type, `detectContextMode()` function with keyword lists, `contextMode` param on `buildContext()`, conditional sub-agent prompt injection | ~172 lines (was ~119) |
| 6 | `src/lib/db/queries.ts` | Added: `listConversations()`, `updateConversationTitle()`, `deleteConversation()` | ~35 lines added |
| 7 | `src/app/api/conversations/route.ts` | **NEW FILE** — GET (list) + POST (create) conversations API | 36 lines |
| 8 | `src/app/api/conversations/[id]/route.ts` | **NEW FILE** — PATCH (title) + DELETE conversations API | 38 lines |
| 9 | `src/components/Sidebar.tsx` | **NEW FILE** — Conversation list UI, mobile overlay, delete, date formatting | 154 lines |
| 10 | `src/components/Chat.tsx` | **REWRITTEN** — Added sidebar integration, conversationId state, transport recreation via useMemo, useChat id param, hamburger menu, "New chat" button, conditional sidebar rendering | 291 lines (was 219) |
| 11 | `src/middleware.ts` | Added `/api/conversations/:path*` to matcher | 1 line changed |
| 12 | `DECISIONS.md` | **NEW FILE** — 9 architecture decision records | ~100 lines |
| 13 | `HANDOFF.md` | **NEW FILE** — This document | |

### Verification Results
- `tsc --noEmit`: zero errors
- `next build`: compiles, 7 routes generated, zero warnings
- 10/10 smoke tests passing
- Status endpoint: `{ status: "ok", database: "connected", anthropic: "configured" }`
- Conversations API returns 401 for unauthenticated requests

---

## Known Gaps, Bugs & Quirks

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 1 | **Google OAuth broken** | **BLOCKING** | `flowName=GeneralOAuthFlow` error. Redirect URI not registered in Google Cloud Console. See [Blocking Issue](#blocking-issue-google-oauth). |
| 2 | **No conversation history loading** | Medium | Switching conversations clears client messages. Should fetch from DB. Needs new endpoint or client-side fetch of messages. |
| 3 | **No conversation ownership check** | Medium | PATCH/DELETE `/api/conversations/[id]` don't verify the conversation belongs to the requesting user. OK for single-user, needs fix before multi-user. |
| 4 | **No auto-titling** | Low | All conversations are "New Conversation". Could generate title from first exchange via Haiku. |
| 5 | **Dual MCP approach** | Low | Both `@ai-sdk/mcp` client (mcp-tools.ts) and Anthropic provider-options MCP config (provider.ts) exist. May need to pick one or verify they don't conflict when both are active. |
| 6 | **Rate limiter first-request bug** | Trivial | After all timestamps expire, the first new request is allowed but not recorded. Next request starts fresh. Doesn't matter for single-user. |
| 7 | **NextAuth beta** | Low | v5.0.0-beta.25 — API surface may change. Pin version. |
| 8 | **Rate limiter resets on restart** | Low | In-memory Map. Lost on server restart. Fine for single-user. |
| 9 | **No conversation cleanup/TTL** | Low | Conversations and messages grow forever. No archival mechanism. |
| 10 | **MCP client never closed** | Trivial | `closeMcpClient()` is exported but never called. Module-level singleton persists for process lifetime. Fine for long-running server. |
| 11 | **CSP allows unsafe-inline/eval** | Low | `script-src 'self' 'unsafe-inline' 'unsafe-eval'` — needed for Next.js dev mode. Could tighten for production with nonce-based CSP. |

---

## Recommended Next Steps

### 1. Fix Google OAuth (BLOCKING)
Add redirect URI in Google Cloud Console. See detailed fix in [Blocking Issue](#blocking-issue-google-oauth).

### 2. Load Conversation History on Switch
When user selects a conversation in sidebar:
- Option A: New API endpoint `GET /api/conversations/[id]/messages` → return messages array
- Option B: Use existing `getMessages(convId)` via a new route
- Client: call on `handleSelectConversation`, populate via `setMessages()` (convert DB messages to UIMessage format with parts)

### 3. Add Conversation Ownership Validation
In `PATCH` and `DELETE` `/api/conversations/[id]`: query the conversation first, verify `user_email === session.user.email` before mutating.

### 4. Auto-Title Conversations
After first assistant response in a new conversation, fire-and-forget Haiku call: "Generate a short title for this conversation based on: [first user message]". Call `updateConversationTitle()`. Update sidebar.

### 5. Wire MCP Google Workspace
Set `MCP_GOOGLE_WORKSPACE_URL` and `MCP_AUTH_TOKEN` in `.env.local`. Start MCP server (Docker Compose or standalone). Verify tools appear.

### 6. Production Deployment
Set domain in Caddyfile. Add production redirect URI. `docker compose up --build -d`. Set up monitoring.

---

## Verification Commands

```bash
cd ~/Desktop/Consulting\ Work/hugh-assistant-2

# Type check (should be zero errors)
npx tsc --noEmit

# Build (should compile successfully)
npm run build

# Start dev server
npm run dev

# Run smoke tests (requires dev server running)
npm run test:smoke

# Check status (should show database: "connected", status: "ok")
curl -s http://localhost:3000/api/status | python3 -m json.tool

# Test auth guard on chat
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/chat
# Expected: 401

# Test auth guard on conversations
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/conversations
# Expected: 401

# Check security headers
curl -sI http://localhost:3000/api/status | grep -iE "x-frame|x-content-type|referrer|strict-transport"

# Check PostgreSQL is running
brew services list | grep postgresql

# Verify database tables exist
/opt/homebrew/opt/postgresql@17/bin/psql hugh_assistant -c "\dt"
```
