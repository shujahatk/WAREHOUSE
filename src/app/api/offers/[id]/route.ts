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
    return NextResponse.json(
      { error: "Forbidden: Your account does not have permission to access Offers." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const adapter = getAdapter();
  const offer = await adapter.services().offers.get(id, user.id);
  if (!offer) {
    return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  }

  return NextResponse.json(offer);
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Authentication required." }, { status: 401 });
  }

  if (user.role === "owner") {
    return NextResponse.json(
      { error: "Forbidden: Admin cannot directly edit offer operational records." },
      { status: 403 }
    );
  }

  if (user.role !== "moderator") {
    return NextResponse.json(
      { error: "Forbidden: Only a Sales & Purchasing Offer Moderator can edit offers." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  try {
    const body = await request.json();
    const adapter = getAdapter();
    const result = await adapter.services().offers.edit({
      ...body,
      id,
      actorId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.value);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to update offer." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Authentication required." }, { status: 401 });
  }

  if (user.role === "owner") {
    return NextResponse.json(
      { error: "Forbidden: Admin cannot directly delete offer records." },
      { status: 403 }
    );
  }

  if (user.role !== "moderator") {
    return NextResponse.json(
      { error: "Forbidden: Only a Sales & Purchasing Offer Moderator can delete offers." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const adapter = getAdapter();
  const result = await adapter.services().offers.delete({ id, actorId: user.id });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: "Offer deleted successfully." });
}

