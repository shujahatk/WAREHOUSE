import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getDataAdapter } from "@/lib/data/local-adapter";
import { sanitizeCsvValue } from "@/lib/security/csv-sanitizer";

export async function GET(request: NextRequest) {
  try {
    const jar = await cookies();
    const sessionId = jar.get("stockflow_session")?.value;
    if (!sessionId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const adapter = getDataAdapter();
    const actor = await adapter.current(sessionId);
    if (!actor || !actor.active) {
      return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });
    }

    // Role check: Admin (owner) sees full audit. Moderator sees only offer-related audit.
    // Staff (manager) and Worker (worker) are denied.
    if (actor.role !== "owner" && actor.role !== "moderator") {
      return NextResponse.json({ error: "Access denied. Insufficient privileges to view audit trail." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const roleFilter = searchParams.get("role")?.trim().toLowerCase() || "";
    const actionFilter = searchParams.get("action")?.trim().toLowerCase() || "";
    const moduleFilter = searchParams.get("module")?.trim().toLowerCase() || "";
    const warehouseFilter = searchParams.get("warehouse")?.trim().toLowerCase() || "";
    const startDate = searchParams.get("startDate")?.trim() || "";
    const endDate = searchParams.get("endDate")?.trim() || "";
    const format = searchParams.get("format")?.trim().toLowerCase() || "json";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));

    // Load store snapshot to resolve actors and warehouses
    const snapshot = await adapter.snapshot(sessionId);
    const userById = new Map(snapshot.users.map((u) => [u.id, u]));
    const warehouseById = new Map(snapshot.warehouses.map((w) => [w.id, w.name]));

    let rawAudit = snapshot.auditLog || [];

    // Moderator scoping: only offer events
    if (actor.role === "moderator") {
      rawAudit = rawAudit.filter((entry) => {
        const targetType = (entry.targetType || "").toLowerCase();
        return targetType === "offer" || targetType === "offer_comment" || targetType === "offer_attachment" || targetType === "offer_sequence";
      });
    }

    // Map and enrich audit records
    let entries = rawAudit.map((entry) => {
      const user = userById.get(entry.userId);
      const actorName = entry.actorName || user?.name || "System";
      const actorRole = entry.actorRole || user?.role || "system";
      const warehouseName = entry.warehouseId ? warehouseById.get(entry.warehouseId) || null : null;

      return {
        id: entry.id,
        createdAt: entry.createdAt,
        userId: entry.userId,
        actorName,
        actorRole,
        action: entry.action,
        module: entry.targetType,
        targetId: entry.targetId,
        details: entry.newValue || entry.oldValue || entry.context || "Action logged",
        oldValue: entry.oldValue || null,
        newValue: entry.newValue || null,
        warehouse: warehouseName,
        warehouseId: entry.warehouseId || null,
        context: entry.context || null,
        requestReference: entry.requestReference || null,
      };
    });

    // Apply filters
    if (search) {
      entries = entries.filter((e) =>
        `${e.actorName} ${e.actorRole} ${e.action} ${e.module} ${e.targetId} ${e.details} ${e.warehouse ?? ""} ${e.requestReference ?? ""}`
          .toLowerCase()
          .includes(search),
      );
    }

    if (roleFilter && roleFilter !== "all") {
      entries = entries.filter((e) => e.actorRole.toLowerCase() === roleFilter);
    }

    if (actionFilter && actionFilter !== "all") {
      entries = entries.filter((e) => e.action.toLowerCase().includes(actionFilter) || e.module.toLowerCase().includes(actionFilter));
    }

    if (moduleFilter && moduleFilter !== "all") {
      entries = entries.filter((e) => e.module.toLowerCase() === moduleFilter);
    }

    if (warehouseFilter && warehouseFilter !== "all") {
      entries = entries.filter(
        (e) => (e.warehouse && e.warehouse.toLowerCase() === warehouseFilter) || (e.warehouseId && e.warehouseId === warehouseFilter),
      );
    }

    if (startDate) {
      const startMs = Date.parse(startDate);
      if (!isNaN(startMs)) {
        entries = entries.filter((e) => Date.parse(e.createdAt) >= startMs);
      }
    }

    if (endDate) {
      const endMs = Date.parse(endDate) + (endDate.length <= 10 ? 86400000 - 1 : 0);
      if (!isNaN(endMs)) {
        entries = entries.filter((e) => Date.parse(e.createdAt) <= endMs);
      }
    }

    // Sort descending by timestamp
    entries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    // Handle CSV export format
    if (format === "csv") {
      const header = ["Timestamp", "User", "Role", "Action", "Module", "Record ID", "Warehouse", "Details", "Before", "After", "Reference"];
      const csvRows = [header.join(",")];

      for (const row of entries) {
        csvRows.push([
          sanitizeCsvValue(row.createdAt),
          sanitizeCsvValue(row.actorName),
          sanitizeCsvValue(row.actorRole),
          sanitizeCsvValue(row.action),
          sanitizeCsvValue(row.module),
          sanitizeCsvValue(row.targetId),
          sanitizeCsvValue(row.warehouse || ""),
          sanitizeCsvValue(row.details),
          sanitizeCsvValue(row.oldValue || ""),
          sanitizeCsvValue(row.newValue || ""),
          sanitizeCsvValue(row.requestReference || ""),
        ].join(","));
      }

      const csvContent = "\uFEFF" + csvRows.join("\r\n");
      const filename = `stockflow-audit-${new Date().toISOString().slice(0, 10)}.csv`;

      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Return paginated JSON
    const total = entries.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = entries.slice(startIndex, startIndex + pageSize);

    return NextResponse.json({
      items: paginatedItems,
      total,
      page,
      pageSize,
      totalPages,
      isScoped: actor.role === "moderator",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load audit trail." },
      { status: 500 },
    );
  }
}

