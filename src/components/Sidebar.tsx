"use client";

import { useState, useEffect, useCallback } from "react";
import type { Conversation } from "@/lib/types";

interface SidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  isOpen,
  onClose,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // Silently fail — sidebar is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations, activeConversationId]);

  // Poll briefly after conversation switch to catch async title updates
  useEffect(() => {
    if (!activeConversationId) return;
    let polls = 0;
    const interval = setInterval(() => {
      polls++;
      fetchConversations();
      if (polls >= 3) clearInterval(interval);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeConversationId, fetchConversations]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        onNewConversation();
      }
    } catch {
      // Silently fail
    }
  };

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-gray-200 bg-gray-50 transition-transform duration-200 lg:relative lg:z-0 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <span className="text-sm font-medium text-gray-700">
            Conversations
          </span>
          <button
            onClick={onNewConversation}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            + New
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No conversations yet
            </div>
          ) : (
            <ul className="py-1">
              {conversations.map((conv) => (
                <li key={conv.id}>
                  <button
                    onClick={() => onSelectConversation(conv.id)}
                    className={`group flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors ${
                      activeConversationId === conv.id
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {conv.title}
                      </div>
                      <div className="text-xs text-gray-400">
                        {formatDate(conv.updated_at)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, conv.id)}
                      className="ml-2 hidden rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-red-500 group-hover:block"
                      title="Delete conversation"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
