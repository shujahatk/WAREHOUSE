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

  // Only Moderator can update status
  if (user.role !== "moderator") {
    return NextResponse.json(
      { error: "Forbidden: Only a Sales & Purchasing Offer Moderator can update offer statuses." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  try {
    const body = await request.json();
    const status = String(body.status ?? "").trim();
    if (!status) {
      return NextResponse.json({ error: "Status is required." }, { status: 400 });
    }

    const adapter = getAdapter();
    const result = await adapter.services().offers.updateStatus({
      id,
      status,
      actorId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.value);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to update offer status." },
      { status: 400 }
    );
  }
}

