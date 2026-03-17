import { getPool } from "./pool";
import type { Conversation, Message, Summary } from "@/lib/types";

// ─── Conversations ───────────────────────────────────────────────

export async function getOrCreateConversation(
  userEmail: string
): Promise<Conversation | null> {
  const pool = getPool();
  if (!pool) return null;

  // Return the most recent conversation if one exists
  const existing = await pool.query<Conversation>(
    `SELECT * FROM conversations
     WHERE user_email = $1
     ORDER BY updated_at DESC LIMIT 1`,
    [userEmail]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  // Otherwise create a new one
  const created = await pool.query<Conversation>(
    `INSERT INTO conversations (user_email) VALUES ($1) RETURNING *`,
    [userEmail]
  );
  return created.rows[0];
}

export async function getConversationById(
  conversationId: string
): Promise<Conversation | null> {
  const pool = getPool();
  if (!pool) return null;

  const res = await pool.query<Conversation>(
    `SELECT * FROM conversations WHERE id = $1`,
    [conversationId]
  );
  return res.rows[0] ?? null;
}

export async function createConversation(
  userEmail: string,
  title?: string
): Promise<Conversation | null> {
  const pool = getPool();
  if (!pool) return null;

  const res = await pool.query<Conversation>(
    `INSERT INTO conversations (user_email, title) VALUES ($1, $2) RETURNING *`,
    [userEmail, title ?? "New Conversation"]
  );
  return res.rows[0];
}

export async function listConversations(
  userEmail: string
): Promise<Conversation[]> {
  const pool = getPool();
  if (!pool) return [];

  const res = await pool.query<Conversation>(
    `SELECT * FROM conversations
     WHERE user_email = $1
     ORDER BY updated_at DESC
     LIMIT 50`,
    [userEmail]
  );
  return res.rows;
}

export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `UPDATE conversations SET title = $2, updated_at = now() WHERE id = $1`,
    [conversationId, title]
  );
}

export async function deleteConversation(
  conversationId: string
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(`DELETE FROM conversations WHERE id = $1`, [conversationId]);
}

export async function touchConversation(
  conversationId: string
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `UPDATE conversations SET updated_at = now() WHERE id = $1`,
    [conversationId]
  );
}

// ─── Messages (APPEND-ONLY — never delete) ──────────────────────

/**
 * Append a message to a conversation.
 * seq is auto-incremented within an advisory-locked transaction
 * to prevent race conditions under concurrent inserts.
 */
export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string
): Promise<Message | null> {
  const pool = getPool();
  if (!pool) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      conversationId,
    ]);
    const res = await client.query<Message>(
      `INSERT INTO messages (conversation_id, role, content, seq)
       VALUES (
         $1, $2, $3,
         COALESCE((SELECT MAX(seq) FROM messages WHERE conversation_id = $1), 0) + 1
       )
       RETURNING *`,
      [conversationId, role, content]
    );
    await client.query("COMMIT");
    await touchConversation(conversationId);
    return res.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get all messages for a conversation, ordered by seq ASC.
 */
export async function getMessages(
  conversationId: string
): Promise<Message[]> {
  const pool = getPool();
  if (!pool) return [];

  const res = await pool.query<Message>(
    `SELECT * FROM messages
     WHERE conversation_id = $1
     ORDER BY seq ASC`,
    [conversationId]
  );
  return res.rows;
}

/**
 * Get the most recent N messages by seq, returned in chronological order.
 */
export async function getRecentMessages(
  conversationId: string,
  count: number
): Promise<Message[]> {
  const pool = getPool();
  if (!pool) return [];

  const res = await pool.query<Message>(
    `SELECT * FROM (
       SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY seq DESC
       LIMIT $2
     ) sub ORDER BY seq ASC`,
    [conversationId, count]
  );
  return res.rows;
}

/**
 * Get messages in a seq range: seq > seqStart AND seq < seqEnd.
 * Used by the summarizer to fetch unsummarized messages outside the window.
 */
export async function getMessagesInRange(
  conversationId: string,
  seqStart: number,
  seqEnd: number
): Promise<Message[]> {
  const pool = getPool();
  if (!pool) return [];

  const res = await pool.query<Message>(
    `SELECT * FROM messages
     WHERE conversation_id = $1 AND seq > $2 AND seq < $3
     ORDER BY seq ASC`,
    [conversationId, seqStart, seqEnd]
  );
  return res.rows;
}

export async function countMessages(
  conversationId: string
): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1`,
    [conversationId]
  );
  return parseInt(res.rows[0].count, 10);
}

/**
 * Get the maximum seq value for a conversation.
 */
export async function getMaxSeq(
  conversationId: string
): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  const res = await pool.query<{ max_seq: number | null }>(
    `SELECT MAX(seq) as max_seq FROM messages WHERE conversation_id = $1`,
    [conversationId]
  );
  return res.rows[0]?.max_seq ?? 0;
}

// ─── Summaries ───────────────────────────────────────────────────

/**
 * Upsert a summary for a conversation.
 * Uses ON CONFLICT to ensure one summary per conversation.
 */
export async function upsertSummary(
  conversationId: string,
  summaryText: string,
  summarizedUpTo: number
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `INSERT INTO summaries (conversation_id, summary_text, summarized_up_to)
     VALUES ($1, $2, $3)
     ON CONFLICT (conversation_id)
     DO UPDATE SET summary_text = $2, summarized_up_to = $3, created_at = now()`,
    [conversationId, summaryText, summarizedUpTo]
  );
}

export async function getLatestSummary(
  conversationId: string
): Promise<Summary | null> {
  const pool = getPool();
  if (!pool) return null;

  const res = await pool.query<Summary>(
    `SELECT * FROM summaries
     WHERE conversation_id = $1
     LIMIT 1`,
    [conversationId]
  );
  return res.rows[0] ?? null;
}
