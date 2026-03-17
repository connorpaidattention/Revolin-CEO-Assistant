import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversationById, getMessages } from "@/lib/db/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversationById(id);
  if (!conversation || conversation.user_email !== session.user.email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await getMessages(id);
  return NextResponse.json(messages);
}
