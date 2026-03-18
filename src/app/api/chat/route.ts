/**
 * POST /api/chat
 *
 * Receives UIMessage[] from the useChat hook, calls Claude via streamText,
 * and streams the response back in Vercel AI SDK format.
 *
 * When DATABASE_URL is set: persists messages, uses sliding window + summary.
 * When DATABASE_URL is not set: uses client-sent messages directly (no persistence).
 */

import {
  streamText,
  generateText,
  type UIMessage,
  type ModelMessage,
  stepCountIs,
  convertToModelMessages,
} from "ai";
import { auth } from "@/auth";
import {
  getPrimaryModel,
  getStrategyModel,
  getSummarizationModel,
  getWebSearchTool,
  getProviderOptions,
} from "@/lib/ai/provider";
import { getMcpTools } from "@/lib/ai/mcp-tools";
import {
  createConversation,
  getConversationById,
  updateConversationTitle,
  saveMessage,
} from "@/lib/db/queries";
import { buildContext, detectContextMode } from "@/lib/context/builder";
import { checkRateLimit } from "@/lib/rateLimit";
import { validateEnv } from "@/lib/env";

// Run env validation once on cold start
validateEnv();

export const maxDuration = 120;

const MAX_MESSAGE_LENGTH = 32_000;

async function generateTitle(
  conversationId: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  const conversation = await getConversationById(conversationId);
  if (!conversation || conversation.title !== "New Conversation") return;

  const { text } = await generateText({
    model: getSummarizationModel(),
    system:
      "Generate a short conversation title (max 6 words). Return ONLY the title, no quotes or punctuation.",
    prompt: `User: ${userMessage.slice(0, 500)}\nAssistant: ${assistantMessage.slice(0, 500)}`,
    maxOutputTokens: 30,
  });

  const title = text.trim().slice(0, 100);
  if (title) {
    await updateConversationTitle(conversationId, title);
  }
}

export async function POST(req: Request) {
  // ── Auth check ──────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ── Rate limit ──────────────────────────────────────────────
  const rateCheck = checkRateLimit(session.user.email);
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: `Rate limited. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s`,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Parse request ───────────────────────────────────────────
  const body = await req.json();
  const uiMessages: UIMessage[] = body.messages ?? [];
  const requestedConversationId: string | undefined = body.conversationId;

  // Extract the latest user message text from the UI message parts
  const lastUiMessage = uiMessages[uiMessages.length - 1];
  let userText = "";
  if (lastUiMessage?.parts) {
    for (const part of lastUiMessage.parts) {
      if (part.type === "text") {
        userText += part.text;
      }
    }
  }

  if (!userText.trim()) {
    return new Response(JSON.stringify({ error: "Empty message" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (userText.length > MAX_MESSAGE_LENGTH) {
    return new Response(
      JSON.stringify({
        error: "Message too long. Please shorten your message.",
      }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // ── DB persistence: resolve or create conversation ──────
    let conversation;
    if (requestedConversationId) {
      // Use the conversation specified by the client
      conversation = { id: requestedConversationId };
    } else {
      conversation = await createConversation(session.user.email);
    }
    const conversationId = conversation?.id ?? null;

    if (conversationId) {
      await saveMessage(conversationId, "user", userText);
    }

    // ── Detect sub-agent routing from user message ─────────
    const contextMode = detectContextMode(userText);

    // ── Build context (system blocks + DB messages) ─────────
    const context = await buildContext(conversationId, contextMode);

    // Determine messages to send to Claude
    let messages: ModelMessage[];

    if (context.hasDatabase && context.dbMessages.length > 0) {
      // Use DB sliding window messages
      messages = context.dbMessages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));
    } else {
      // No DB — use client-sent messages directly
      messages = await convertToModelMessages(uiMessages);
    }

    // ── Configure tools ───────────────────────────────────────
    const mcpTools = await getMcpTools();
    const tools = {
      web_search: getWebSearchTool(),
      ...mcpTools,
    };

    // ── Resolve model (Opus for strategy, Sonnet for everything else) ──
    const model =
      contextMode === "strategy" ? getStrategyModel() : getPrimaryModel();

    // ── Stream response ───────────────────────────────────────
    const result = streamText({
      model,
      system: context.systemMessages,
      messages,
      tools,
      providerOptions: getProviderOptions(),
      stopWhen: stepCountIs(5),
      onFinish: async ({ text }) => {
        try {
          if (conversationId && text) {
            await saveMessage(conversationId, "assistant", text);
            generateTitle(conversationId, userText, text).catch((err) =>
              console.error("[chat] Auto-title failed:", err)
            );
          }
        } catch (err) {
          console.error("[chat] Failed to persist assistant response:", err);
        }
      },
      onError: ({ error }) => {
        console.error("[chat] Stream error:", error);
      },
    });

    const response = result.toUIMessageStreamResponse();
    if (conversationId) {
      response.headers.set("X-Conversation-Id", conversationId);
    }
    return response;
  } catch (error) {
    console.error("[chat] Error:", error);

    const message =
      error instanceof Error && error.message.includes("API key")
        ? "AI service is not properly configured. Please contact the administrator."
        : "An error occurred processing your request.";

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
