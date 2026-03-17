/**
 * Context builder.
 *
 * Assembles the system prompt as SystemModelMessage[] with per-block
 * providerOptions for Anthropic prompt caching, and retrieves the
 * sliding window of recent messages from the database.
 *
 * When DATABASE_URL is set: uses persisted messages + summary.
 * When DATABASE_URL is not set: returns just the system prompt;
 * the chat route falls back to client-sent messages.
 */

import type { SystemModelMessage } from "ai";
import {
  SYSTEM_PROMPT,
  GREG_PROMPT,
  SARAH_PROMPT,
  MARCUS_PROMPT,
  SAM_PROMPT,
  ALEX_PROMPT,
} from "@/lib/ai/provider";
import {
  getRecentMessages,
  getLatestSummary,
  countMessages,
} from "@/lib/db/queries";
import { maybeSummarize } from "./summarizer";
import type { Message } from "@/lib/types";

const SLIDING_WINDOW_SIZE = 20;
const SUMMARIZATION_THRESHOLD = 40;

export type ContextMode =
  | "default"
  | "analytics"
  | "operations"
  | "strategy"
  | "tech"
  | "relations";

export interface ChatContext {
  /** System prompt as SystemModelMessage[] with cache_control via providerOptions. */
  systemMessages: SystemModelMessage[];
  /** Recent messages from DB sliding window (empty if no DB). */
  dbMessages: Message[];
  /** Whether DB persistence is active. */
  hasDatabase: boolean;
  /** Conversation ID if DB is available. */
  conversationId: string | null;
}

/**
 * Detect context mode from user message content.
 * Checks for explicit /dept commands or keyword-based intent.
 */
export function detectContextMode(userText: string): ContextMode {
  const lower = userText.toLowerCase().trim();

  // Explicit commands
  if (lower.startsWith("/greg") || lower.startsWith("/analytics")) return "analytics";
  if (lower.startsWith("/sarah") || lower.startsWith("/ops")) return "operations";
  if (lower.startsWith("/marcus") || lower.startsWith("/strategy")) return "strategy";
  if (lower.startsWith("/sam") || lower.startsWith("/tech")) return "tech";
  if (lower.startsWith("/alex") || lower.startsWith("/relations")) return "relations";

  // Keyword-based detection
  const analyticsKeywords = [
    "analytics", "metrics", "data", "spreadsheet", "numbers",
    "dashboard", "kpi", "report", "chart", "graph", "trend",
  ];
  const opsKeywords = [
    "inventory", "shipping", "logistics", "vendor", "supply chain",
    "warehouse", "order", "fulfillment", "manufacturing",
  ];
  const strategyKeywords = [
    "strategy", "strategic", "competitive", "positioning", "market entry",
    "business model", "pricing strategy", "vision", "roadmap", "long-term",
    "scenario", "fundraise", "moat",
  ];
  const techKeywords = [
    "technical", "architecture", "platform", "website", "ecommerce",
    "e-commerce", "database", "api", "infrastructure", "developer",
    "code", "deploy", "migration",
  ];
  const relationsKeywords = [
    "partnership", "sponsor", "relationship", "communications", "community",
    "pr", "media", "outreach", "stakeholder", "investor", "event", "hiring",
  ];

  const hasAnalytics = analyticsKeywords.some((kw) => lower.includes(kw));
  const hasOps = opsKeywords.some((kw) => lower.includes(kw));
  const hasStrategy = strategyKeywords.some((kw) => lower.includes(kw));
  const hasTech = techKeywords.some((kw) => lower.includes(kw));
  const hasRelations = relationsKeywords.some((kw) => lower.includes(kw));

  // Only route if exactly one department clearly matches
  const matches: ContextMode[] = [];
  if (hasAnalytics) matches.push("analytics");
  if (hasOps) matches.push("operations");
  if (hasStrategy) matches.push("strategy");
  if (hasTech) matches.push("tech");
  if (hasRelations) matches.push("relations");

  return matches.length === 1 ? matches[0] : "default";
}

/**
 * Build the context for a chat request.
 *
 * Returns system messages (with Anthropic cache_control) and the sliding
 * window of recent messages from the database.
 */
export async function buildContext(
  conversationId: string | null,
  contextMode: ContextMode = "default"
): Promise<ChatContext> {
  // Base system prompt — cached via providerOptions
  const systemMessages: SystemModelMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
  ];

  // Append department-specific sub-agent prompt if routed
  if (contextMode === "analytics") {
    systemMessages.push({
      role: "system",
      content: GREG_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });
  } else if (contextMode === "operations") {
    systemMessages.push({
      role: "system",
      content: SARAH_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });
  } else if (contextMode === "strategy") {
    systemMessages.push({
      role: "system",
      content: MARCUS_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });
  } else if (contextMode === "tech") {
    systemMessages.push({
      role: "system",
      content: SAM_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });
  } else if (contextMode === "relations") {
    systemMessages.push({
      role: "system",
      content: ALEX_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });
  }

  // No database — return just the system prompt
  if (!conversationId) {
    return {
      systemMessages,
      dbMessages: [],
      hasDatabase: false,
      conversationId: null,
    };
  }

  // Check if summarization is needed
  const totalMessages = await countMessages(conversationId);
  if (totalMessages > SUMMARIZATION_THRESHOLD) {
    // Fire-and-forget — don't block the response
    maybeSummarize(conversationId).catch((err) => {
      console.error("[builder] Summarization error:", err);
    });
  }

  // Fetch summary and recent messages in parallel
  const [summary, recentMessages] = await Promise.all([
    getLatestSummary(conversationId),
    getRecentMessages(conversationId, SLIDING_WINDOW_SIZE),
  ]);

  // Append summary as a cached system message
  if (summary) {
    systemMessages.push({
      role: "system",
      content: `<conversation_summary>\n${summary.summary_text}\n</conversation_summary>`,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });
  }

  return {
    systemMessages,
    dbMessages: recentMessages,
    hasDatabase: true,
    conversationId,
  };
}
