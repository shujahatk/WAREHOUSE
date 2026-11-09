import { cookies } from "next/headers";
import { getAdapter } from "@/domain/local-adapter";
import { isActiveRole } from "@/lib/permissions";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const exp = url.searchParams.get("exp") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  const adapter = getAdapter();

  const jar = await cookies();
  const sessionId = jar.get("stockflow_session")?.value;
  if (!sessionId) {
    return new Response("Unauthorized: Authentication required.", { status: 401 });
  }

  const user = await adapter.current(sessionId);
  if (!user) {
    return new Response("Unauthorized: Session expired or invalid.", { status: 401 });
  }
  if (!user.active || !isActiveRole(user.role)) {
    return new Response("Forbidden: Inactive or unauthorized account.", { status: 403 });
  }

  const file = await adapter.openFile(id, exp, sig, Date.now(), sessionId);
  if (!file) return new Response("Not found or link expired", { status: 404 });

  const store = await adapter.snapshot(sessionId);
  const doc = store.documents.find((d) => d.storageKey === id || d.id === id);

  if (doc && user.role === "worker") {
    // If this document is attached to a worker general request, only the creator worker (or staff/admin) can access it
    const genReqAttachment = store.workerGeneralRequestAttachments?.find((a) => a.documentId === doc.id);
    if (genReqAttachment) {
      const genReq = store.workerGeneralRequests?.find((gr) => gr.id === genReqAttachment.generalRequestId);
      if (genReq && genReq.createdBy !== user.id) {
        return new Response("Forbidden: You can only access attachments from your own requests.", { status: 403 });
      }
    }

    const workerWh = user.warehouseId ? store.warehouses.find((w) => w.id === user.warehouseId)?.name : null;
    const shipmentWhId = doc.shipmentId ? store.shipments.find((s) => s.id === doc.shipmentId)?.warehouseId : null;
    const requestWhId = doc.requestId ? store.requests.find((r) => r.id === doc.requestId)?.warehouseId : null;
    const targetWhId = shipmentWhId ?? requestWhId ?? null;
    if (
      (targetWhId && user.warehouseId && targetWhId !== user.warehouseId) ||
      (doc.warehouse && workerWh && doc.warehouse !== workerWh && doc.warehouse !== user.warehouseId)
    ) {
      return new Response("Forbidden: You can only access files from your warehouse.", { status: 403 });
    }
  }

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${file.name.replaceAll('"', "")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
