import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getConversationById,
  updateConversationTitle,
  deleteConversation,
} from "@/lib/db/queries";

export async function PATCH(
  req: Request,
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

  const body = await req.json();
  if (typeof body.title === "string") {
    await updateConversationTitle(id, body.title);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
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

  await deleteConversation(id);
  return NextResponse.json({ ok: true });
}
