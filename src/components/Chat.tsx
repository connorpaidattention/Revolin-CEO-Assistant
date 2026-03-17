"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { StatusResponse } from "@/lib/types";
import SignOutButton from "./SignOutButton";
import Sidebar from "./Sidebar";

const SUGGESTION_CHIPS = [
  "What's on my calendar today?",
  "Draft a follow-up email to...",
  "Summarize our Q1 numbers",
  "What should I prioritize this week?",
];

export default function Chat() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: conversationId ? { conversationId } : undefined,
      }),
    [conversationId]
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: conversationId ?? "default",
    transport: chatTransport,
  });

  const [input, setInput] = useState("");
  const [serviceStatus, setServiceStatus] = useState<StatusResponse | null>(
    null
  );
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch system status on mount
  useEffect(() => {
    fetch("/api/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setServiceStatus(data))
      .catch(() => setServiceStatus(null));
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status === "ready") {
      sendMessage({ text: input });
      setInput("");
    }
  };

  const handleChipClick = (text: string) => {
    if (status === "ready") {
      sendMessage({ text });
    }
  };

  const handleNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setSidebarOpen(false);
  };

  const handleSelectConversation = async (id: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setConversationId(id);
    setMessages([]);
    setSidebarOpen(false);
    setLoadingHistory(true);

    try {
      const res = await fetch(`/api/conversations/${id}/messages`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to load messages");
      const dbMessages = await res.json();
      const uiMessages = dbMessages
        .filter((msg: { role: string }) => msg.role !== "system")
        .map((msg: { id: string; role: string; content: string }) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          parts: [{ type: "text" as const, text: msg.content }],
        }));
      if (!controller.signal.aborted) {
        setMessages(uiMessages);
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("[chat] Failed to load conversation history:", err);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingHistory(false);
      }
    }
  };

  const dbConnected = serviceStatus?.database === "connected";

  return (
    <div className="flex h-screen">
      {/* Sidebar — only show when DB is connected */}
      {dbConnected && (
        <Sidebar
          activeConversationId={conversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Main chat area */}
      <div
        className="flex flex-1 flex-col bg-white"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Hamburger menu for sidebar (mobile + DB connected) */}
            {dbConnected && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            )}
            <h1 className="text-lg font-semibold text-gray-900">
              Hugh Assistant
            </h1>
            {/* Status indicators */}
            <div className="flex items-center gap-2">
              <StatusDot
                label="DB"
                state={dbConnected ? "ok" : "off"}
              />
              <StatusDot
                label="MCP"
                state={
                  serviceStatus?.mcp === "connected"
                    ? "ok"
                    : "off"
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dbConnected && (
              <button
                onClick={handleNewConversation}
                className="hidden rounded-md px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:block"
              >
                New chat
              </button>
            )}
            <SignOutButton />
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-2xl space-y-6">
            {serviceStatus?.anthropic === "missing" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                Anthropic API key is not configured. Chat will not work until
                ANTHROPIC_API_KEY is set.
              </div>
            )}

            {loadingHistory && messages.length === 0 && (
              <div className="flex justify-center py-20 text-sm text-gray-400">
                Loading conversation...
              </div>
            )}

            {!loadingHistory && messages.length === 0 && (
              <div className="flex flex-col items-center py-20 text-center">
                <h2 className="text-2xl font-semibold text-gray-800">
                  Hugh&apos;s Chief of Staff
                </h2>
                <p className="mt-2 text-gray-500">
                  Your executive assistant — ready to help with ops, strategy,
                  and everything in between.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                  {SUGGESTION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleChipClick(chip)}
                      className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 ${
                    message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <div className="text-sm leading-relaxed">
                    {message.parts.map((part, index) =>
                      part.type === "text" ? (
                        message.role === "assistant" ? (
                          <div
                            key={index}
                            className="prose prose-sm max-w-none"
                          >
                            <ReactMarkdown>{part.text}</ReactMarkdown>
                          </div>
                        ) : (
                          <span key={index} className="whitespace-pre-wrap">
                            {part.text}
                          </span>
                        )
                      ) : null
                    )}
                  </div>
                </div>
              </div>
            ))}

            {status === "submitted" && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-gray-100 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Error: {error.message}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 px-4 py-4">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-2xl items-center gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={status !== "ready"}
              placeholder="Send a message..."
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-base outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status !== "ready" || !input.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatusDot({
  label,
  state,
}: {
  label: string;
  state: "ok" | "off";
}) {
  return (
    <span className="flex items-center gap-1 text-xs text-gray-500">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          state === "ok" ? "bg-green-500" : "bg-gray-300"
        }`}
      />
      {label}
    </span>
  );
}
