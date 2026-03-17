/**
 * Conversation summarizer.
 *
 * Triggers when a conversation exceeds THRESHOLD messages.
 * Summarizes messages between the last summary point and the
 * sliding window floor, producing a cumulative summary.
 *
 * Uses Claude Haiku for cost efficiency.
 * Messages are NEVER deleted — the table is append-only.
 */

import { generateText } from "ai";
import { getSummarizationModel } from "@/lib/ai/provider";
import {
  countMessages,
  getMaxSeq,
  getLatestSummary,
  getMessagesInRange,
  upsertSummary,
} from "@/lib/db/queries";

const SUMMARIZE_THRESHOLD = 40;
const WINDOW_SIZE = 20;

/** Prevents concurrent summarizations for the same conversation. */
const activeSummarizations = new Set<string>();

/**
 * Check if summarization is needed and run it if so.
 * Fire-and-forget — errors are logged but never thrown.
 * Deduplicates concurrent calls for the same conversation.
 */
export async function maybeSummarize(
  conversationId: string
): Promise<void> {
  if (activeSummarizations.has(conversationId)) return;
  activeSummarizations.add(conversationId);
  try {
    const count = await countMessages(conversationId);
    if (count <= SUMMARIZE_THRESHOLD) return;

    const maxSeq = await getMaxSeq(conversationId);
    const windowFloor = maxSeq - WINDOW_SIZE;

    const existingSummary = await getLatestSummary(conversationId);
    const summarizedUpTo = existingSummary?.summarized_up_to ?? 0;

    // Only summarize if there are unsummarized messages outside the window
    if (summarizedUpTo >= windowFloor) return;

    // Get messages to summarize: after last summary point, before window
    const messagesToSummarize = await getMessagesInRange(
      conversationId,
      summarizedUpTo,
      windowFloor
    );

    if (messagesToSummarize.length === 0) return;

    // Build the summarization prompt — include previous summary for cumulative result
    const previousSummary = existingSummary?.summary_text ?? "";
    const transcript = messagesToSummarize
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");

    const prompt = previousSummary
      ? `Here is the previous conversation summary:\n\n${previousSummary}\n\nHere are the new messages to incorporate:\n\n${transcript}\n\nProduce an updated cumulative summary of the entire conversation so far. Be concise but preserve key facts, decisions, action items, and context needed to continue the conversation naturally.`
      : `Summarize the following conversation. Be concise but preserve key facts, decisions, action items, and context needed to continue the conversation naturally.\n\n${transcript}`;

    const result = await generateText({
      model: getSummarizationModel(),
      system:
        "You are a conversation summarizer. Produce concise, factual summaries that preserve essential context.",
      prompt,
      maxOutputTokens: 1024,
    });

    // Upsert summary with the new summarized_up_to watermark
    await upsertSummary(conversationId, result.text, windowFloor);

    console.log(
      `[summarizer] Summarized conversation ${conversationId}: ` +
        `${messagesToSummarize.length} messages (seq ${summarizedUpTo + 1} to ${windowFloor})`
    );
  } catch (err) {
    console.error("[summarizer] Error:", err);
    // Non-fatal: conversation continues without summarization
  } finally {
    activeSummarizations.delete(conversationId);
  }
}
