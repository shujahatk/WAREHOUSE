import { NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { readStore, storePath } from "@/domain/store";

export async function GET() {
  try {
    const file = storePath();
    let mtime = 0;
    try {
      const s = await stat(file);
      mtime = s.mtimeMs;
    } catch {}

    const store = await readStore(file);
    const historyCount = (store.inventoryHistory || []).length;
    const revision = `${mtime}-${store.stockMovements.length}-${store.auditLog.length}-${store.purchaseOrders.length}-${store.requests.length}-${historyCount}`;

    return NextResponse.json({
      ok: true,
      revision,
      timestamp: new Date().toISOString(),
      stockMovementCount: store.stockMovements.length,
      auditCount: store.auditLog.length,
      ordersCount: store.purchaseOrders.length,
      historyCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
