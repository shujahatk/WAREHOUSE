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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Authentication required." }, { status: 401 });
  }

  // Only Admin can approve or reject offers
  if (user.role !== "owner") {
    return NextResponse.json(
      { error: "Forbidden: Only Admin can approve or reject offers." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  try {
    const body = await request.json();
    const decision = body.decision === "rejected" ? "rejected" : "approved";
    const decisionNote = typeof body.decisionNote === "string" ? body.decisionNote : (body.note || "");

    if (!decisionNote.trim()) {
      return NextResponse.json(
        { error: "A decision note is mandatory when approving or rejecting an offer." },
        { status: 400 }
      );
    }

    const adapter = getAdapter();
    const result = await adapter.services().offers.decide({
      id,
      decision,
      decisionNote,
      actorId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.value);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to record decision." },
      { status: 400 }
    );
  }
}

