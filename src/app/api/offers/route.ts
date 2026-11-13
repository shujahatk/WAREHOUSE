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

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Authentication required." }, { status: 401 });
  }

  // Admin and Moderator only; Staff and Worker have NO access
  if (user.role !== "owner" && user.role !== "moderator") {
    return NextResponse.json(
      { error: "Forbidden: Your account does not have permission to access Offers Management." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") as "purchasing" | "selling") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const priority = url.searchParams.get("priority") || undefined;
  const country = url.searchParams.get("country") || undefined;
  const team = url.searchParams.get("team") || undefined;
  const isFavParam = url.searchParams.get("isFavourite");
  const isFavourite = isFavParam !== null ? isFavParam === "true" : undefined;
  const search = url.searchParams.get("search") || undefined;
  const page = parseInt(url.searchParams.get("page") || "1", 10) || 1;
  const pageSize = parseInt(url.searchParams.get("pageSize") || "25", 10) || 25;

  const adapter = getAdapter();
  const result = await adapter.services().offers.list(
    { kind, status, priority, country, team, isFavourite, search, page, pageSize },
    user.id
  );

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Authentication required." }, { status: 401 });
  }

  // Only Moderator can create offers
  if (user.role !== "moderator") {
    return NextResponse.json(
      { error: "Forbidden: Only a Sales & Purchasing Offer Moderator can create offers." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const adapter = getAdapter();
    const result = await adapter.services().offers.create({
      ...body,
      actorId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.value, { status: 201 });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Invalid offer payload." },
      { status: 400 }
    );
  }
}

