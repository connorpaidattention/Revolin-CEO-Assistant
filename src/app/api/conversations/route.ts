import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listConversations,
  createConversation,
} from "@/lib/db/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const conversations = await listConversations(session.user.email);
  return NextResponse.json(conversations);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : undefined;
  const conversation = await createConversation(session.user.email, title);

  if (!conversation) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  return NextResponse.json(conversation, { status: 201 });
}
