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
  const attachments = await adapter.services().offers.attachments(id, user.id);
  return NextResponse.json(attachments);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Authentication required." }, { status: 401 });
  }

  // Only Moderator can upload/attach files to offers
  if (user.role !== "moderator") {
    return NextResponse.json(
      { error: "Forbidden: Only a Sales & Purchasing Offer Moderator can manage offer attachments." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  try {
    const body = await request.json();
    const adapter = getAdapter();
    const result = await adapter.services().offers.addAttachment({
      id,
      name: body.name,
      mime: body.mime,
      bytesBase64: body.bytesBase64,
      byteSize: body.byteSize,
      kind: body.kind,
      actorId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.value, { status: 201 });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to add attachment." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Authentication required." }, { status: 401 });
  }

  if (user.role !== "moderator") {
    return NextResponse.json(
      { error: "Forbidden: Only a Sales & Purchasing Offer Moderator can manage offer attachments." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const url = new URL(request.url);
  const attachmentId = url.searchParams.get("attachmentId") || "";
  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId query parameter is required." }, { status: 400 });
  }

  const adapter = getAdapter();
  const result = await adapter.services().offers.deleteAttachment({
    id,
    attachmentId,
    actorId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: "Attachment deleted." });
}

