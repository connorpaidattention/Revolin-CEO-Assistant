/** Database row types for Hugh assistant */

export interface Conversation {
  id: string;
  user_email: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  seq: number;
  created_at: Date;
}

export interface Summary {
  id: string;
  conversation_id: string;
  summary_text: string;
  summarized_up_to: number;
  created_at: Date;
}

export interface StatusResponse {
  status: "ok" | "error";
  anthropic: "configured" | "missing";
  mcp: "connected" | "disconnected" | "not_configured";
  model: string;
  database: "connected" | "disconnected";
  timestamp: string;
}
