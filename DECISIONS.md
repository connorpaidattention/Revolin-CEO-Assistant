# Architecture Decisions

## ADR-001: Vercel AI SDK v6 (UIMessage format)

**Context:** Chose AI SDK v6 over v5 for native streaming, UIMessage parts-based rendering, and built-in chat transport.

**Decision:** Use `@ai-sdk/react` useChat with `DefaultChatTransport` and `UIMessage` format (message.parts, not message.content).

**Consequences:** Must use `sendMessage({ text })` not `sendMessage(text)`. Rendering iterates over `message.parts` array.

## ADR-002: Append-only messages table

**Context:** Need audit trail and reliable summarization watermarks.

**Decision:** Messages table is append-only — never delete rows. Summarization uses seq watermarks, not deletion.

**Consequences:** Table grows forever. Need eventual archival strategy (not yet implemented).

## ADR-003: Advisory locks for seq atomicity

**Context:** Concurrent message inserts could produce duplicate seq numbers.

**Decision:** Use `pg_advisory_xact_lock(hashtext(conversation_id))` within a transaction for each insert.

**Consequences:** Serializes inserts per conversation. Acceptable for single-user, would need review at scale.

## ADR-004: Optional database (graceful degradation)

**Context:** Want the app to work without PostgreSQL for quick demos and development.

**Decision:** All DB functions check `getPool()` and return null/empty when DATABASE_URL is unset. Chat route falls back to client-sent messages.

**Consequences:** No persistence in stateless mode. Summarization, conversation history, and sidebar are disabled.

## ADR-005: Single email allowlist

**Context:** Hugh is the only user. No need for user management.

**Decision:** `ALLOWED_EMAIL` env var checked in NextAuth signIn callback. Single Google account.

**Consequences:** Adding users requires env var change and restart. Fine for personal assistant.

## ADR-006: Haiku for summarization

**Context:** Summarization runs fire-and-forget on every request when threshold exceeded.

**Decision:** Use Claude Haiku 4.5 for cost efficiency. Cumulative strategy (includes previous summary).

**Consequences:** ~10x cheaper than Sonnet. Quality is sufficient for context preservation.

## ADR-007: In-memory rate limiter

**Context:** Need basic abuse prevention for the API endpoint.

**Decision:** Sliding window rate limiter using a Map. 30 requests per minute per user email.

**Consequences:** Resets on server restart. Sufficient for single-user deployment.

## ADR-008: Multi-agent routing via keyword detection

**Context:** Want Greg (analytics) and Sarah (ops) sub-agents without complex NLU.

**Decision:** Keyword-based detection in `detectContextMode()` plus explicit `/greg`, `/sarah`, `/analytics`, `/ops` commands. Only routes when one department clearly matches.

**Consequences:** May misroute ambiguous queries. Default falls through to Chief of Staff persona. Can add LLM-based routing later.

## ADR-009: MCP via @ai-sdk/mcp SSE transport

**Context:** Need Google Workspace tools (Drive, Gmail, Calendar) accessible through chat.

**Decision:** Use `@ai-sdk/mcp` with SSE transport connecting to external MCP server. Tools merged into streamText alongside web_search.

**Consequences:** Requires running MCP server separately (Docker Compose handles this). Gracefully returns empty tools when not configured.
