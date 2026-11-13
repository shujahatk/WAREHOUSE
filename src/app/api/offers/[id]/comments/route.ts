import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdapter } from "@/domain/local-adapter";

async function getAuthUser() {
  const jar = await cookies();
  const sessionId = jar.get("stockflow_session")?.value;
  if (!sessionId) return null;
  const adapter = getAdapter();
  return adapter.current(sessionId);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Authentication required." }, { status: 401 });
  }

  if (user.role !== "owner" && user.role !== "moderator") {
    return NextResponse.json({ error: "Forbidden: Access denied." }, { status: 403 });
  }

  const { id } = await context.params;
  const adapter = getAdapter();
  const comments = await adapter.services().offers.comments(id, user.id);
  return NextResponse.json(comments);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Authentication required." }, { status: 401 });
  }

  // Moderator and Admin can add notes/comments
  if (user.role !== "owner" && user.role !== "moderator") {
    return NextResponse.json({ error: "Forbidden: Access denied." }, { status: 403 });
  }

  const { id } = await context.params;
  try {
    const body = await request.json();
    const comment = String(body.comment ?? "").trim();
    if (!comment) {
      return NextResponse.json({ error: "Comment text cannot be empty." }, { status: 400 });
    }

    const adapter = getAdapter();
    const result = await adapter.services().offers.addComment({
      id,
      comment,
      actorId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.value, { status: 201 });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to add comment." },
      { status: 400 }
    );
  }
}

