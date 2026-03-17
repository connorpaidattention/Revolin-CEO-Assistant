# Sprint A Handoff — Conversation Integrity (Tasks 3.13, 3.14, 3.15)

## Audit Findings

- **3.14:** PATCH and DELETE on `/api/conversations/[id]` checked auth but never verified the conversation belonged to the authenticated user. Any authenticated user could modify/delete any conversation by ID.
- **3.13:** `handleSelectConversation` in Chat.tsx cleared messages and set conversation ID, but never fetched history from the database. Switching conversations showed an empty chat.
- **3.15:** New conversations stayed titled "New Conversation" permanently. No auto-titling mechanism existed.

## Changes Made

### Task 3.14: Conversation Ownership Validation

- **`src/lib/db/queries.ts`** — Added `getConversationById(conversationId)` query function. Returns full `Conversation` row or null.
- **`src/app/api/conversations/[id]/route.ts`** — Both PATCH and DELETE now fetch the conversation and verify `user_email` matches `session.user.email`. Returns 404 (not 403) to prevent ID enumeration.

### Task 3.13: Load Conversation History on Switch

- **`src/app/api/conversations/[id]/messages/route.ts`** — New GET endpoint. Auth + ownership check, returns all messages for a conversation ordered by seq.
- **`src/components/Chat.tsx`** — `handleSelectConversation` is now async. Fetches messages from the new endpoint, maps DB messages to UIMessage format (filtering system messages), and sets them. Uses AbortController to cancel stale fetches on rapid switching. Added loading indicator shown while history loads.

### Task 3.15: Auto-Title Conversations

- **`src/app/api/chat/route.ts`** — Added `generateTitle()` helper that uses Haiku to generate a 6-word title from the first user/assistant exchange. Called fire-and-forget in `onFinish` after saving the assistant message. Guard: only runs when `title === "New Conversation"`.
- **`src/components/Sidebar.tsx`** — Added a short polling burst (3 polls at 3s intervals) when `activeConversationId` changes, to catch the async title update.

## Decisions

- **404 over 403:** Ownership failures return 404 to prevent conversation ID enumeration attacks.
- **AbortController pattern:** Prevents stale message loads from overwriting current conversation on rapid switching.
- **System messages filtered client-side:** System messages are reconstructed by `buildContext` on each request, so they're filtered out when displaying history.
- **Haiku for titles:** Uses the same summarization model (cheap, fast) for title generation. Max 30 output tokens.
- **Polling for title refresh:** Lightweight approach for a single-user app. Three 3s polls are simpler than WebSocket or SSE for this use case.

## Test Results

- `npm run typecheck` — passes clean

## Manual Testing Checklist

- [ ] Switch between conversations — history loads correctly
- [ ] Rapid-click between conversations — no stale messages appear
- [ ] New conversation → send message → title updates in sidebar within ~9s
- [ ] Cannot access another user's conversation via direct API call (returns 404)
- [ ] Empty conversations show the empty state (not loading indicator)
