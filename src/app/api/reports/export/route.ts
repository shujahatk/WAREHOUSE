import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdapter } from "@/domain/local-adapter";
import { can } from "@/lib/data/permissions";
import { logger } from "@/lib/logger";

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const rowLines = rows.map((row) => row.map(escapeCsvField).join(","));
  return [headerLine, ...rowLines].join("\r\n");
}

export async function GET(request: Request) {
  try {
    const jar = await cookies();
    const sessionId = jar.get("stockflow_session")?.value;
    if (!sessionId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const adapter = getAdapter();
    const currentUser = await adapter.current(sessionId);
    if (!currentUser || !currentUser.active || !can(currentUser, "report:view")) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "stock";
    const warehouseFilter = searchParams.get("warehouse");
    const materialFilter = searchParams.get("material");

    const store = await adapter.snapshot();
    const now = new Date().toISOString().slice(0, 10);

    let csv = "";
    const filename = `stockflow-${type}-${now}.csv`;

    switch (type) {
      case "stock": {
        const headers = ["Material Number", "Description", "Warehouse", "Weight (kg)", "Low Stock Threshold (kg)", "Status"];
        let balances = store.stockBalances;
        if (currentUser.role === "worker" && currentUser.warehouseId) {
          balances = balances.filter((b) => b.warehouseId === currentUser.warehouseId);
        } else if (warehouseFilter) {
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

      case "movements": {
        const headers = ["Date", "Movement ID", "Direction", "Material", "Warehouse", "Net Weight (kg)", "Request ID", "Created By"];
        let movements = store.stockMovements;
        if (currentUser.role === "worker" && currentUser.warehouseId) {
          movements = movements.filter((m) => m.warehouseId === currentUser.warehouseId);
        }
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

      case "shipments": {
        const headers = ["Reference", "Direction", "PO Number", "Container", "Warehouse", "Party", "Status", "Handover Date", "Carrier"];
        let shipments = store.shipments;
        if (currentUser.role === "worker" && currentUser.warehouseId) {
          shipments = shipments.filter((s) => s.warehouseId === currentUser.warehouseId);
        } else if (currentUser.role === "customer" && currentUser.companyId) {
          shipments = shipments.filter((s) => {
            const po = store.purchaseOrders.find((x) => x.id === s.purchaseOrderId);
            return po?.companyId === currentUser.companyId;
          });
        }
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

      case "requests": {
        const headers = ["Request Number", "Type", "Shipment", "Container", "Warehouse", "Status", "Created By", "Created At", "Lines Count"];
        let requests = store.requests;
        if (currentUser.role === "worker" && currentUser.warehouseId) {
          requests = requests.filter((r) => r.warehouseId === currentUser.warehouseId);
        }
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
