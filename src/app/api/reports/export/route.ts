import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDataAdapter } from "@/lib/data/local-adapter";
import { sanitizeCsvValue } from "@/lib/security/csv-sanitizer";
import { logger } from "@/lib/logger";

function toCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(sanitizeCsvValue).join(",");
  const rowLines = rows.map((row) => row.map(sanitizeCsvValue).join(","));
  return "\uFEFF" + [headerLine, ...rowLines].join("\r\n");
}

export async function GET(request: Request) {
  try {
    const jar = await cookies();
    const sessionId = jar.get("stockflow_session")?.value;
    if (!sessionId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const adapter = getDataAdapter();
    const currentUser = await adapter.current(sessionId);
    if (!currentUser || !currentUser.active) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "stock";
    const warehouseFilter = searchParams.get("warehouse");
    const materialFilter = searchParams.get("material");

    // Role-based export permissions:
    // Owner: Full export access across all reports
    // Manager (Staff): Permitted directories (suppliers, customers, materials)
    // Moderator: Offer data only
    if (currentUser.role === "owner") {
      // Admin can export all types
    } else if (currentUser.role === "manager") {
      if (!["suppliers", "customers", "materials"].includes(type)) {
        return new NextResponse("Forbidden: Staff cannot export this report type.", { status: 403 });
      }
    } else if (currentUser.role === "moderator") {
      if (type !== "offers") {
        return new NextResponse("Forbidden: Offer Moderator can only export offer data.", { status: 403 });
      }
    } else {
      return new NextResponse("Forbidden: Insufficient privileges to export data.", { status: 403 });
    }

    const store = await adapter.snapshot(sessionId);
    const now = new Date().toISOString().slice(0, 10);

    let csv = "";
    const filename = `stockflow-${type}-${now}.csv`;

    switch (type) {
      case "stock": {
        const headers = ["Material Number", "Description", "Warehouse", "Weight (kg)", "Low Stock Threshold (kg)", "Status"];
        let balances = store.stockBalances;
        if (warehouseFilter) {
          balances = balances.filter((b) => b.warehouseId === warehouseFilter);
        }
        if (materialFilter) {
          balances = balances.filter((b) => b.materialId === materialFilter);
        }

        const rows = balances.map((b) => {
          const mat = store.materials.find((m) => m.id === b.materialId);
          const wh = store.warehouses.find((w) => w.id === b.warehouseId);
          const threshold = mat?.lowStockThresholdKg ?? 0;
          const status = b.weightKg <= 0 ? "Zero" : b.weightKg < threshold ? "Low" : "Ok";
          return [
            mat?.materialNumber ?? b.materialId,
            mat?.description ?? "",
            wh?.name ?? b.warehouseId,
            b.weightKg,
            threshold,
            status,
          ];
        });
        csv = toCsv(headers, rows);
        break;
      }

      case "materials": {
        const headers = ["Material Number", "Description", "Unit", "Low Stock Threshold (kg)"];
        const rows = store.materials.map((m) => [
          m.materialNumber,
          m.description,
          m.unit,
          m.lowStockThresholdKg,
        ]);
        csv = toCsv(headers, rows);
        break;
      }

      case "orders": {
        const headers = ["Order Number", "Supplier / Company", "Value (EUR)", "Status", "Notes", "Created At"];
        const rows = store.purchaseOrders.map((o) => {
          const co = store.companies.find((c) => c.id === o.companyId);
          return [o.number, co?.name ?? "", o.valueEur, o.status, o.notes ?? "", o.createdAt];
        });
        csv = toCsv(headers, rows);
        break;
      }

      case "shipments": {
        const headers = ["Reference", "Direction", "PO Number", "Container", "Warehouse", "Party", "Status", "Handover Date", "Carrier"];
        const shipments = store.shipments;
        const rows = shipments.map((s) => {
          const wh = store.warehouses.find((x) => x.id === s.warehouseId);
          const po = store.purchaseOrders.find((x) => x.id === s.purchaseOrderId);
          const co = po ? store.companies.find((x) => x.id === po.companyId) : null;
          return [
            s.reference,
            s.direction,
            po?.number ?? "",
            s.containerNumber,
            wh?.name ?? "",
            co?.name ?? "",
            s.status,
            s.handedOverAt ?? "",
            s.carrierName,
          ];
        });
        csv = toCsv(headers, rows);
        break;
      }

      case "offers": {
        const headers = ["Offer Number", "Kind", "Material", "Grade", "Quantity", "Unit", "Price / Unit", "Total (EUR)", "Location", "Status", "Approval"];
        const rows = (store.offers || []).map((o) => [
          o.number,
          o.kind === "purchasing" ? "Purchasing" : "Selling",
          o.material,
          o.materialGrade ?? "",
          o.quantity,
          o.unit,
          o.pricePerUnit,
          o.totalValue,
          o.location ?? o.country,
          o.status,
          o.approvalStatus,
        ]);
        csv = toCsv(headers, rows);
        break;
      }

      case "suppliers": {
        const headers = ["ID", "Supplier Name", "Status"];
        const rows = store.companies.filter((c) => c.kind === "supplier").map((c) => [c.id, c.name, c.active ? "Active" : "Inactive"]);
        csv = toCsv(headers, rows);
        break;
      }

      case "customers": {
        const headers = ["ID", "Customer Name", "Status"];
        const rows = store.companies.filter((c) => c.kind === "customer").map((c) => [c.id, c.name, c.active ? "Active" : "Inactive"]);
        csv = toCsv(headers, rows);
        break;
      }

      case "movements": {
        const headers = ["Date", "Movement ID", "Direction", "Material", "Warehouse", "Net Weight (kg)", "Request ID", "Created By"];
        const movements = store.stockMovements;
        const rows = movements.map((m) => {
          const mat = store.materials.find((x) => x.id === m.materialId);
          const wh = store.warehouses.find((x) => x.id === m.warehouseId);
          return [
            m.createdAt,
            m.id,
            m.direction.toUpperCase(),
            mat?.description ?? m.materialId,
            wh?.name ?? m.warehouseId,
            m.weightKg,
            m.requestId,
            m.createdBy,
          ];
        });
        csv = toCsv(headers, rows);
        break;
      }

      case "requests": {
        const headers = ["Request Number", "Type", "Shipment", "Container", "Warehouse", "Status", "Created By", "Created At", "Lines Count"];
        const requests = store.requests;
        const rows = requests.map((r) => {
          const wh = store.warehouses.find((x) => x.id === r.warehouseId);
          const shipment = store.shipments.find((x) => x.id === r.shipmentId);
          const lines = store.requestLines.filter((l) => l.requestId === r.id);
          return [
            r.number,
            r.type,
            shipment?.reference ?? "",
            r.containerNumber,
            wh?.name ?? "",
            r.status,
            r.createdBy,
            r.createdAt,
            lines.length,
          ];
        });
        csv = toCsv(headers, rows);
        break;
      }

      case "demurrage": {
        const headers = ["Shipment", "Container", "Warehouse", "Started At", "Completed At", "Free Minutes", "Billable Minutes", "Charge (EUR)"];
        const demurrage = store.demurrageRecords;
        const rows = demurrage.map((d) => {
          const s = store.shipments.find((x) => x.id === d.shipmentId);
          const wh = s ? store.warehouses.find((x) => x.id === s.warehouseId) : null;
          return [
            s?.reference ?? d.shipmentId,
            s?.containerNumber ?? "",
            wh?.name ?? "",
            d.startedAt ?? "",
            d.completedAt ?? "",
            d.freeMinutes,
            d.billableMinutes ?? 0,
            d.chargeEur ?? 0,
          ];
        });
        csv = toCsv(headers, rows);
        break;
      }

      default:
        return new NextResponse("Unknown report type", { status: 400 });
    }

    logger.info("CSV report exported", { user: currentUser.email, role: currentUser.role, type });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("prerender") || error.message.includes("DYNAMIC_SERVER_USAGE"))) {
      throw error;
    }
    logger.error("Failed to generate CSV export", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
