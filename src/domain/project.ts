import { signedFileUrl } from "./files.ts";
import type { DocumentRecord, RequestRecord, StoreData } from "./schemas.ts";
import {
  emptyDemurrage,
  EMPTY_CUSTOMS,
  PENDING_CUSTOMS_CONFIRMATION,
  PENDING_SELLER,
  type AnnexStatus,
  type CustomsConfirmation,
  type DemoConversation,
  type DemoDocument,
  type DemoOrder,
  type OrderStatus,
  type ShipmentSection,
  type WorkspaceState,
  GENERAL_REQUEST_CATEGORY_LABELS,
  GENERAL_REQUEST_PRIORITY_LABELS,
  GENERAL_REQUEST_STATUS_LABELS,
  type GeneralRequestView,
  type GeneralRequestAttachmentView,
  parseOperationalRequestDescription,
  OFFER_STATUS_LABELS,
  OFFER_PRIORITY_LABELS,
  OFFER_APPROVAL_LABELS,
  type OfferView,
  type OfferAttachmentView,
  type OfferCommentView,
  type OfferActivityView,
  type ContainerInventoryView,
  type ContainerMaterialDetail,
  type ContainerPackagingDetail,
  type InventoryHistoryView,
} from "./view.ts";
import type { Role } from "@/lib/permissions";

const orderStatus: Record<string, OrderStatus> = {
  draft: "Planned",
  submitted: "Pending",
  approved: "Approved",
  declined: "Rejected",
};

const annexStatus: Record<string, AnnexStatus> = {
  uploaded: "Uploaded",
  under_review: "Under Review",
  approved: "Approved",
};

export function projectStore(store: StoreData, now: string): WorkspaceState {
  const sign = (key: string) => (store.fileSecret ? signedFileUrl(store.fileSecret, key, now).url : null);
  const warehouseName = new Map(store.warehouses.map((item) => [item.id, item.name]));
  const companyById = new Map(store.companies.map((item) => [item.id, item]));
  const materialById = new Map(store.materials.map((item) => [item.id, item]));
  const packagingById = new Map(store.packagingTypes.map((item) => [item.id, item]));
  const userById = new Map(store.users.map((item) => [item.id, item]));

  const orders: DemoOrder[] = store.purchaseOrders.map((order) => {
    const company = companyById.get(order.companyId);
    const lines = store.purchaseOrderLines.filter((line) => line.purchaseOrderId === order.id);
    const linked = store.shipments.find((item) => item.purchaseOrderId === order.id);
    const warehouse = linked ? (warehouseName.get(linked.warehouseId) ?? "") : "";
    const title = order.title || (company ? `${company.name} - ${lines[0]?.description || "Order"}` : order.number);
    return {
      number: order.number,
      title,
      supplier: company?.kind === "supplier" ? company.name : "",
      material: lines.map((line) => line.description).filter(Boolean).join(", ") || "—",
      warehouse: warehouse || "—",
      quantityKg: lines.reduce((sum, line) => sum + line.quantityKg, 0),
      valueEur: order.valueEur,
      unitPrice: "",
      incoterms: "",
      status: orderStatus[order.status] ?? "Planned",
      date: order.createdAt.slice(0, 10),
      owner: userById.get(order.createdBy)?.name ?? "",
      supplierEmail: "",
      forwarder: "",
      container: linked?.containerNumber || linked?.reference || "",
      ship: "",
      eta: "",
      customerCompany: company?.kind === "customer" ? company.name : "",
      notes: order.notes,
    };
  });

  function sectionsFor(shipmentId: string): ShipmentSection[] {
    const requests = store.requests.filter((item) => item.shipmentId === shipmentId && item.status !== "deleted");
    return requests.flatMap((request) =>
      store.requestLines
        .filter((line) => line.requestId === request.id)
        .map((line) => {
          const packaging = packagingById.get(line.packagingTypeId);
          return {
            id: line.id,
            material: materialById.get(line.materialId)?.description ?? "Material",
            mode: "weight" as const,
            grossKg: line.grossKg,
            packagingId: line.packagingTypeId,
            packagingQty: line.packageCount,
            tarePerUnitKg: packaging?.tareKg ?? null,
            totalTareKg: line.tareTotalKg,
            netKg: line.netKg,
            count: line.packageCount,
          };
        }),
    );
  }

  const containers = store.shipments
    .filter((item) => item.direction === "inbound")
    .map((item) => {
      const demurrage = store.demurrageRecords.find((row) => row.shipmentId === item.id);
      const order = item.purchaseOrderId ? store.purchaseOrders.find((row) => row.id === item.purchaseOrderId) : undefined;
      const company = order ? companyById.get(order.companyId) : undefined;
      return {
        number: item.reference,
        po: order?.number ?? "",
        supplier: company?.kind === "supplier" ? company.name : "",
        origin: item.originCountry || "—",
        warehouse: warehouseName.get(item.warehouseId) ?? "",
        status: item.status as WorkspaceState["containers"][number]["status"],
        eta: "—",
        sections: sectionsFor(item.id),
        containerNumber: item.containerNumber,
        demurrage: demurrage
          ? {
              startedAt: demurrage.startedAt,
              completedAt: demurrage.completedAt,
              freeMinutes: demurrage.freeMinutes,
              ratePerMinute: demurrage.ratePerMinute,
              elapsedMinutes: demurrage.elapsedMinutes,
              billableMinutes: demurrage.billableMinutes,
              chargeEUR: demurrage.chargeEur,
            }
          : emptyDemurrage(),
      };
    });

  const outbound = store.shipments
    .filter((item) => item.direction === "outbound")
    .map((item) => {
      const order = item.purchaseOrderId ? store.purchaseOrders.find((row) => row.id === item.purchaseOrderId) : undefined;
      const company = order ? companyById.get(order.companyId) : undefined;
      const customs = store.customsRecords.find((row) => row.shipmentId === item.id);
      const proof = customs?.proofDocumentId ? store.documents.find((row) => row.id === customs.proofDocumentId) : undefined;
      const confirmer = customs?.confirmedBy ? userById.get(customs.confirmedBy) : undefined;
      const confirmation: CustomsConfirmation = customs?.confirmedAt
        ? {
            status: "Confirmed",
            confirmedBy: confirmer?.name ?? "",
            confirmedAt: customs.confirmedAt,
            proofName: proof?.name ?? "",
            proofMime: proof?.mime ?? "",
            proofSize: proof?.byteSize ?? 0,
          }
        : PENDING_CUSTOMS_CONFIRMATION;
      const sections = sectionsFor(item.id);
      return {
        number: item.reference,
        customer: company?.kind === "customer" ? company.name : "",
        material: sections[0]?.material ?? "",
        weightKg: sections.reduce((sum, section) => sum + (section.netKg ?? 0), 0),
        warehouse: warehouseName.get(item.warehouseId) ?? "",
        status: item.status as WorkspaceState["outbound"][number]["status"],
        date: "",
        po: order?.number ?? "",
        container: item.containerNumber,
        sections,
        carrier: item.carrierName,
        handover: item.handedOverAt ?? "",
        customs: customs
          ? {
              reference: customs.reference,
              procedureNote: customs.procedureNote,
              goodsDescription: customs.goodsDescription,
              declarantReference: customs.declarantReference,
            }
          : EMPTY_CUSTOMS,
        sellerConfirmation:
          item.sellerStatus === "Confirmed"
            ? { status: "Confirmed" as const, company: item.sellerCompany, confirmedBy: item.sellerConfirmedBy, confirmedAt: item.sellerConfirmedAt }
            : PENDING_SELLER,
        customsConfirmation: confirmation,
        dispatchOverride: item.overrideReason ? { reason: item.overrideReason, by: item.overrideBy ?? "", at: item.overrideAt ?? "" } : null,
        audit: store.auditLog
          .filter((entry) => entry.targetId === item.id)
          .map((entry) => ({
            id: entry.id,
            at: entry.createdAt,
            actor: userById.get(entry.userId)?.name ?? "",
            action: entry.action,
            detail: entry.newValue ?? "",
          })),
      };
    });

  const attachments = store.documents.map((item) => {
    const uploader = userById.get(item.createdBy);
    const req = item.requestId ? store.requests.find((r) => r.id === item.requestId) : null;
    return {
      id: item.id,
      shipment: shipmentRef(store, item.shipmentId) || item.containerNumber || "",
      po: item.poNumber || orderNumber(store, item.purchaseOrderId),
      name: item.readableName || item.name,
      mime: item.mime,
      role: item.kind as "cmr" | "photo" | "annex7" | "customs_proof" | "other",
      size: item.byteSize,
      url: sign(item.storageKey),
      requestId: item.requestId ?? req?.id ?? null,
      requestNumber: item.requestNumber ?? req?.number ?? null,
      containerNumber: item.containerNumber ?? null,
      warehouse: item.warehouse ?? null,
      uploadedBy: item.createdBy,
      uploadedByName: uploader?.name || uploader?.email || "Unknown",
      uploadedAt: item.createdAt,
      originalFilename: item.originalFilename || item.name,
      readableName: item.readableName || item.name,
      notes: item.notes ?? null,
      status: item.status,
      cmr: item.cmrReference
        ? {
            reference: item.cmrReference,
            carrier: item.cmrCarrier ?? "",
            goodsDescription: item.cmrGoodsDescription ?? "",
            remarks: item.cmrRemarks ?? "",
            enteredBy: item.cmrEnteredBy ?? "",
            enteredAt: item.cmrEnteredAt ?? "",
          }
        : null,
    };
  });

  const documents: DemoDocument[] = store.documents
    .filter((item) => item.kind !== "photo")
    .map((item) => documentView(store, item, sign(item.storageKey)));

  const conversations = conversationsFrom(store, userById);

  const requestedTransfers = store.auditLog
    .filter((entry) => entry.action === "transfer-requested" && entry.newValue)
    .map((entry) => {
      const body = JSON.parse(entry.newValue ?? "{}") as {
        id?: string;
        clientKey?: string;
        from?: string;
        to?: string;
        material?: string;
        quantity?: number;
        weightKg?: number;
        status?: "Submitted" | "Completed";
      };
      return {
        id: body.id ?? entry.id,
        clientKey: body.clientKey ?? entry.id,
        from: body.from ?? "",
        to: body.to ?? "",
        material: body.material ?? "",
        quantity: body.quantity ?? 0,
        weightKg: body.weightKg ?? 0,
        status: (body.status === "Completed" ? "Completed" : "Submitted") as "Submitted" | "Completed",
      };
    });
  const requestedIds = new Set(requestedTransfers.map((t) => t.id));
  const completedTransferMovements = store.auditLog
    .filter((entry) => entry.action === "stock-transferred" && !requestedIds.has(entry.targetId))
    .flatMap((entry) => {
      const outMov = store.stockMovements.find((m) => m.requestId === entry.targetId && m.direction === "out");
      const inMov = store.stockMovements.find((m) => m.requestId === entry.targetId && m.direction === "in");
      if (!outMov || !inMov) return [];
      return [
        {
          id: entry.targetId,
          clientKey: entry.oldValue ?? entry.id,
          from: warehouseName.get(outMov.warehouseId) ?? "",
          to: warehouseName.get(inMov.warehouseId) ?? "",
          material: materialById.get(outMov.materialId)?.description ?? "",
          quantity: outMov.weightKg,
          weightKg: outMov.weightKg,
          status: "Completed" as const,
        },
      ];
    });
  const transfers = [...requestedTransfers, ...completedTransferMovements];

  const postedMovements = store.stockMovements.map((movement) => {
    const request = store.requests.find((item) => item.id === movement.requestId);
    const shipment = request ? store.shipments.find((item) => item.id === request.shipmentId) : undefined;
    const warehouse = warehouseName.get(movement.warehouseId) ?? "";
    return {
      id: movement.id,
      kind: movement.direction === "in" ? ("Inbound" as const) : ("Outbound" as const),
      reference: request?.number ?? "",
      material: materialById.get(movement.materialId)?.description ?? "",
      from: movement.direction === "out" ? warehouse : shipment?.originCountry || "",
      to: movement.direction === "in" ? warehouse : shipment?.destinationCountry || "",
      netKg: movement.weightKg,
      date: movement.createdAt.slice(0, 10),
      note: shipment?.reference ?? "",
    };
  });

  const activity = [...store.auditLog]
    .reverse()
    .slice(0, 500)
    .map((entry) => {
      const u = userById.get(entry.userId);
      const w = entry.warehouseId ? store.warehouses.find((wh) => wh.id === entry.warehouseId) : undefined;
      return {
        id: entry.id,
        text: entry.newValue || entry.action,
        status: entry.action,
        href: hrefFor(store, entry.targetType, entry.targetId),
        actor: entry.actorName || u?.name || "System",
        actorRole: entry.actorRole || u?.role,
        module: entry.targetType,
        recordId: entry.targetId,
        warehouse: w?.name ?? null,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        context: entry.context,
        requestReference: entry.requestReference,
        createdAt: entry.createdAt,
      };
    });

  const notifications = (store.notifications ?? [])
    .slice()
    .reverse()
    .map((n) => {
      const w = n.warehouseId ? store.warehouses.find((wh) => wh.id === n.warehouseId) : undefined;
      return {
        id: n.id,
        eventType: n.eventType,
        title: n.title,
        message: n.message,
        targetType: n.targetType ?? undefined,
        targetId: n.targetId ?? undefined,
        link: n.link ?? undefined,
        warehouse: w?.name ?? null,
        read: n.read,
        readAt: n.readAt ?? null,
        createdAt: n.createdAt,
      };
    });

  const requests = store.requests.map((req) => {
    const shipment = store.shipments.find((item) => item.id === req.shipmentId);
    const order = req.purchaseOrderId ? store.purchaseOrders.find((item) => item.id === req.purchaseOrderId) : undefined;
    const lines = store.requestLines
      .filter((line) => line.requestId === req.id)
      .map((line) => {
        const material = materialById.get(line.materialId);
        const packaging = packagingById.get(line.packagingTypeId);
        return {
          id: line.id,
          materialId: line.materialId,
          material: material?.description ?? "Material",
          packagingTypeId: line.packagingTypeId,
          packagingName: packaging?.name ?? "Packaging",
          packageCount: line.packageCount,
          grossKg: line.grossKg,
          tareTotalKg: line.tareTotalKg,
          netKg: line.netKg,
        };
      });
    return {
      id: req.id,
      number: req.number,
      type: req.type,
      shipmentId: req.shipmentId,
      shipmentReference: shipment?.reference ?? "",
      purchaseOrderId: req.purchaseOrderId,
      purchaseOrderNumber: order?.number ?? null,
      containerNumber: req.containerNumber,
      warehouseId: req.warehouseId,
      warehouse: warehouseName.get(req.warehouseId) ?? "",
      createdBy: req.createdBy,
      createdByName: userById.get(req.createdBy)?.name ?? "User",
      status: req.status,
      declineReason: req.declineReason,
      sentBackNote: req.sentBackNote,
      approvedBy: req.approvedBy,
      approvedByName: req.approvedBy ? (userById.get(req.approvedBy)?.name ?? null) : null,
      approvedAt: req.approvedAt,
      enteredBy: req.enteredBy,
      enteredByName: req.enteredBy ? (userById.get(req.enteredBy)?.name ?? null) : null,
      enteredAt: req.enteredAt,
      deletedBy: req.deletedBy,
      deletedByName: req.deletedBy ? (userById.get(req.deletedBy)?.name ?? null) : null,
      deletedAt: req.deletedAt,
      createdAt: req.createdAt,
      lines,
    };
  });

  const docById = new Map(store.documents.map((d) => [d.id, d]));
  const shipmentById = new Map(store.shipments.map((s) => [s.id, s]));
  const poById = new Map(store.purchaseOrders.map((p) => [p.id, p]));

  const generalRequests: GeneralRequestView[] = (store.workerGeneralRequests || [])
    .filter((req) => req.status !== "deleted")
    .map((req) => {
      const attachments: GeneralRequestAttachmentView[] = (store.workerGeneralRequestAttachments || [])
        .filter((att) => att.generalRequestId === req.id)
        .map((att) => {
          const doc = docById.get(att.documentId);
          return {
            id: att.id,
            documentId: att.documentId,
            name: doc?.readableName || doc?.name || "Document",
            mime: doc?.mime || "application/octet-stream",
            byteSize: doc?.byteSize || 0,
            url: doc?.storageKey ? sign(doc.storageKey) : null,
            storageKey: doc?.storageKey || "",
          };
        });

      const shipment = req.shipmentId ? shipmentById.get(req.shipmentId) : null;
      const order = req.purchaseOrderId ? poById.get(req.purchaseOrderId) : null;
      const creator = userById.get(req.createdBy);
      const decider = req.decidedBy ? userById.get(req.decidedBy) : null;
      const { operationalDetails } = parseOperationalRequestDescription(req.description);

      return {
        id: req.id,
        number: req.number,
        category: req.category,
        categoryLabel: GENERAL_REQUEST_CATEGORY_LABELS[req.category] ?? req.category,
        priority: req.priority,
        priorityLabel: GENERAL_REQUEST_PRIORITY_LABELS[req.priority] ?? req.priority,
        description: req.description,
        operationalDetails,
        warehouseId: req.warehouseId,
        warehouse: warehouseName.get(req.warehouseId) ?? "",
        shipmentId: req.shipmentId,
        shipmentReference: shipment?.reference ?? null,
        purchaseOrderId: req.purchaseOrderId,
        purchaseOrderNumber: order?.number ?? null,
        createdBy: req.createdBy,
        createdByName: creator?.name ?? "Worker",
        status: req.status,
        statusLabel: GENERAL_REQUEST_STATUS_LABELS[req.status] ?? req.status,
        responseNote: req.responseNote,
        decidedBy: req.decidedBy,
        decidedByName: decider?.name ?? null,
        decidedAt: req.decidedAt,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt,
        attachments,
      };
    });

  const offers: OfferView[] = (store.offers || [])
    .filter((o) => !o.deletedAt)
    .map((o) => {
      const creator = userById.get(o.createdBy);
      const decider = o.decidedBy ? userById.get(o.decidedBy) : null;
      const updater = o.updatedBy ? userById.get(o.updatedBy) : null;

      const offerAttachments: OfferAttachmentView[] = (store.offerAttachments || [])
        .filter((att) => att.offerId === o.id)
        .map((att) => {
          const uploader = userById.get(att.uploadedBy);
          return {
            id: att.id,
            offerId: att.offerId,
            name: att.name,
            kind: att.kind,
            mime: att.mime,
            byteSize: att.byteSize,
            url: att.storageKey ? sign(att.storageKey) : att.url ?? null,
            storageKey: att.storageKey,
            uploadedBy: att.uploadedBy,
            uploadedByName: uploader?.name ?? "User",
            createdAt: att.createdAt,
          };
        });

      const comments: OfferCommentView[] = (store.offerComments || [])
        .filter((c) => c.offerId === o.id)
        .map((c) => {
          const author = userById.get(c.authorId);
          return {
            id: c.id,
            offerId: c.offerId,
            authorId: c.authorId,
            authorName: author?.name ?? "User",
            authorRole: (author?.role ?? "moderator") as Role,
            comment: c.comment,
            createdAt: c.createdAt,
          };
        });

      const activities: OfferActivityView[] = (store.offerActivities || [])
        .filter((act) => act.offerId === o.id)
        .map((act) => {
          const actor = userById.get(act.actorId);
          return {
            id: act.id,
            offerId: act.offerId,
            actorId: act.actorId,
            actorName: actor?.name ?? "User",
            action: act.action,
            details: act.details,
            createdAt: act.createdAt,
          };
        });

      return {
        id: o.id,
        number: o.number,
        kind: o.kind,
        kindLabel: o.kind === "purchasing" ? ("Purchasing Offer" as const) : ("Selling Offer" as const),
        material: o.material,
        materialType: o.materialType || "Plastics",
        materialGrade: o.materialGrade || "Standard",
        quantity: o.quantity,
        unit: o.unit || "kg",
        pricePerUnit: o.pricePerUnit,
        currency: o.currency || "EUR",
        totalValue: o.totalValue,
        country: o.country,
        location: o.location || "",
        truckLoads: o.truckLoads || 1,
        description: o.description || "",
        priority: OFFER_PRIORITY_LABELS[o.priority] ?? "Medium",
        priorityKey: o.priority,
        offerType: o.offerType || "Spot",
        team: o.team || "General",
        status: OFFER_STATUS_LABELS[o.status] ?? "Draft",
        statusKey: o.status,
        approvalStatus: o.approvalStatus,
        approvalLabel: OFFER_APPROVAL_LABELS[o.approvalStatus] ?? "Pending",
        adminDecisionNote: o.adminDecisionNote,
        decidedBy: o.decidedBy,
        decidedByName: decider?.name ?? null,
        decidedAt: o.decidedAt,
        isFavourite: o.isFavourite || false,
        createdBy: o.createdBy,
        createdByName: creator?.name ?? "Moderator",
        createdAt: o.createdAt,
        updatedBy: o.updatedBy,
        updatedByName: updater?.name ?? null,
        updatedAt: o.updatedAt,
        attachments: offerAttachments,
        comments,
        activities,
      };
    });

  // --------------------------------------------------------------------------
  // Container-Level Inventory Projection
  // --------------------------------------------------------------------------
  const STANDARD_CONTAINER_TARE_KG = 2200; // Standard 20ft container tare (kept separate)

  const containerInventory: ContainerInventoryView[] = store.shipments.map((shipment) => {
    const order = shipment.purchaseOrderId ? store.purchaseOrders.find((po) => po.id === shipment.purchaseOrderId) : undefined;
    const warehouse = warehouseName.get(shipment.warehouseId) ?? "—";
    const linkedRequests = store.requests.filter((req) => req.shipmentId === shipment.id && req.status !== "deleted");
    const lines = linkedRequests.flatMap((req) => store.requestLines.filter((line) => line.requestId === req.id));

    // Group lines by material
    const materialMap = new Map<string, { materialName: string; netWeightKg: number; grossWeightKg: number; packagings: ContainerPackagingDetail[] }>();

    for (const line of lines) {
      const mat = materialById.get(line.materialId);
      const pkg = packagingById.get(line.packagingTypeId);
      const matId = line.materialId;
      const matName = mat?.description ?? "Material";
      const pkgName = pkg?.name ?? "Standard Pallet";
      const emptyUnitTareKg = pkg?.tareKg ?? (line.packageCount > 0 ? line.tareTotalKg / line.packageCount : 0);

      let matEntry = materialMap.get(matId);
      if (!matEntry) {
        matEntry = { materialName: matName, netWeightKg: 0, grossWeightKg: 0, packagings: [] };
        materialMap.set(matId, matEntry);
      }
      matEntry.netWeightKg += line.netKg;
      matEntry.grossWeightKg += line.grossKg;

      matEntry.packagings.push({
        packagingTypeId: line.packagingTypeId,
        packagingTypeName: pkgName,
        packageCount: line.packageCount,
        emptyUnitTareKg: Math.round(emptyUnitTareKg * 100) / 100,
        totalPackagingWeightKg: Math.round(line.tareTotalKg * 100) / 100,
      });
    }

    const materials: ContainerMaterialDetail[] = Array.from(materialMap.entries()).map(([materialId, data]) => ({
      materialId,
      materialName: data.materialName,
      netWeightKg: Math.round(data.netWeightKg * 100) / 100,
      grossWeightKg: Math.round(data.grossWeightKg * 100) / 100,
      packagings: data.packagings,
    }));

    const totalPackagingCount = lines.reduce((sum, l) => sum + l.packageCount, 0);
    const totalPackagingWeightKg = Math.round(lines.reduce((sum, l) => sum + l.tareTotalKg, 0) * 100) / 100;
    const totalNetWeightKg = Math.round(lines.reduce((sum, l) => sum + l.netKg, 0) * 100) / 100;
    // Gross packed cargo weight = Net material weight + Total packaging weight
    const grossPackedCargoWeightKg = Math.round((totalNetWeightKg + totalPackagingWeightKg) * 100) / 100;
    const totalGrossCargoAndContainerKg = Math.round((grossPackedCargoWeightKg + STANDARD_CONTAINER_TARE_KG) * 100) / 100;

    return {
      id: shipment.id,
      containerNumber: shipment.containerNumber || shipment.reference,
      shipmentReference: shipment.reference,
      poNumber: order?.number ?? null,
      warehouse,
      status: shipment.status,
      direction: shipment.direction,
      materials,
      totalPackagingCount,
      totalPackagingWeightKg,
      totalNetWeightKg,
      grossPackedCargoWeightKg,
      containerTareKg: STANDARD_CONTAINER_TARE_KG,
      totalGrossCargoAndContainerKg,
      updatedAt: shipment.handedOverAt || shipment.overrideAt || now,
    };
  });

  // --------------------------------------------------------------------------
  // Complete Inventory History Projection (Append-Only)
  // --------------------------------------------------------------------------
  const inventoryHistory: InventoryHistoryView[] = (store.inventoryHistory || []).map((entry) => ({
    id: entry.id,
    materialName: entry.materialName,
    warehouseName: entry.warehouseName,
    containerNumber: entry.containerNumber,
    quantityBefore: entry.quantityBefore,
    quantityChange: entry.quantityChange,
    quantityAfter: entry.quantityAfter,
    packagingTypeName: entry.packagingTypeName,
    packagingCount: entry.packagingCount,
    packagingUnitTareKg: entry.packagingUnitTareKg,
    totalPackagingWeightKg: entry.totalPackagingWeightKg,
    grossWeightKg: entry.grossWeightKg,
    operationType: entry.operationType,
    operationReason: entry.operationReason,
    reference: entry.reference,
    poNumber: entry.poNumber,
    soNumber: entry.soNumber,
    performedByName: entry.performedByName,
    createdAt: entry.createdAt,
  }));

  // Backfill from existing stockMovements if store.inventoryHistory is empty
  if (inventoryHistory.length === 0 && store.stockMovements.length > 0) {
    for (const mov of store.stockMovements) {
      const mat = materialById.get(mov.materialId);
      const wh = store.warehouses.find((w) => w.id === mov.warehouseId);
      const req = store.requests.find((r) => r.id === mov.requestId);
      const line = store.requestLines.find((l) => l.id === mov.requestLineId);
      const pkg = line ? packagingById.get(line.packagingTypeId) : undefined;
      const user = userById.get(mov.createdBy);
      inventoryHistory.push({
        id: mov.id,
        materialName: mat?.description ?? "Material",
        warehouseName: wh?.name ?? "Warehouse",
        containerNumber: req?.containerNumber ?? null,
        quantityBefore: mov.weightKg,
        quantityChange: mov.direction === "in" ? mov.weightKg : -mov.weightKg,
        quantityAfter: mov.weightKg,
        packagingTypeName: pkg?.name ?? null,
        packagingCount: line?.packageCount ?? null,
        packagingUnitTareKg: pkg?.tareKg ?? null,
        totalPackagingWeightKg: line?.tareTotalKg ?? null,
        grossWeightKg: line?.grossKg ?? null,
        operationType: mov.direction === "in" ? "unloading" : "loading",
        operationReason: `${mov.direction === "in" ? "Inbound receipt" : "Outbound dispatch"} for ${req?.number || mov.id}`,
        reference: req?.number ?? mov.id,
        poNumber: null,
        soNumber: null,
        performedByName: user?.name ?? "System",
        createdAt: mov.createdAt,
      });
    }
  }

  return {
    orders,
    containers,
    outbound,
    stock: store.stockBalances.map((balance) => {
      const material = materialById.get(balance.materialId);
      const warehouse = store.warehouses.find((item) => item.id === balance.warehouseId);
      return {
        id: balance.id,
        material: material?.description ?? "Material",
        category: material?.unit ?? "",
        packaging: "",
        quantity: balance.weightKg,
        weightKg: balance.weightKg,
        reorder: material?.lowStockThresholdKg ?? 0,
        warehouse: warehouse?.name ?? "",
        location: warehouse?.country ?? "",
      };
    }),
    transfers,
    conversations,
    documents,
    activity,
    accounts: store.users.map((user) => ({
      email: user.email,
      name: user.name,
      role: user.role,
      warehouse: user.warehouseId ? (warehouseName.get(user.warehouseId) ?? null) : null,
      company: user.companyId ? (companyById.get(user.companyId)?.name ?? null) : null,
      status: user.active ? "Active" : "Inactive",
    })),
    packaging: store.packagingTypes.map((item) => ({ id: item.id, label: item.name, tareKg: item.tareKg, preset: false })),
    attachments,
    postedMovements,
    requests,
    generalRequests,
    offers,
    containerInventory,
    inventoryHistory,
    notifications,
    directory: {
      warehouses: store.warehouses.map((item) => ({ id: item.id, name: item.name, country: item.country })),
      companies: store.companies.map((item) => ({ id: item.id, name: item.name, kind: item.kind })),
    },
  };
}

function shipmentRef(store: StoreData, shipmentId: string | null): string {
  if (!shipmentId) return "";
  const found = store.shipments.find((item) => item.id === shipmentId || item.reference === shipmentId);
  return found?.reference ?? shipmentId;
}

function orderNumber(store: StoreData, purchaseOrderId: string | null): string {
  if (!purchaseOrderId) return "";
  return store.purchaseOrders.find((item) => item.id === purchaseOrderId)?.number ?? "";
}

function documentView(store: StoreData, item: DocumentRecord, url: string | null): DemoDocument {
  const annex = store.annex7Records.find((row) => row.documentId === item.id);
  const shipment = item.shipmentId ? store.shipments.find((row) => row.id === item.shipmentId) : undefined;
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    meta: item.kind,
    origin: item.kind === "annex7" ? "annex7" : "selected",
    po: orderNumber(store, item.purchaseOrderId),
    url,
    annex:
      annex && shipment
        ? {
            reference: annex.reference,
            shipment: shipment.reference,
            direction: shipment.direction,
            notes: annex.notes,
            status: annexStatus[annex.status] ?? "Uploaded",
            uploadedBy: store.users.find((user) => user.id === annex.uploadedBy)?.name ?? "",
            uploadedAt: annex.uploadedAt,
            mime: item.mime,
            size: item.byteSize,
            history: [],
          }
        : null,
  };
}

function conversationsFrom(store: StoreData, userById: Map<string, { name: string; role: string }>): DemoConversation[] {
  const groups = new Map<string, DemoConversation>();
  for (const message of store.poMessages) {
    const order = message.purchaseOrderId ? store.purchaseOrders.find((item) => item.id === message.purchaseOrderId) : undefined;
    const company = order ? store.companies.find((item) => item.id === order.companyId) : undefined;
    const key = `${message.scope}:${order?.number ?? message.id}`;
    const conversation = groups.get(key) ?? {
      id: key,
      title: order ? `${order.number}` : "Conversation",
      po: order?.number ?? "",
      scope: message.scope,
      customerCompany: company?.kind === "customer" ? company.name : "",
      supplier: company?.kind === "supplier" ? company.name : "",
      messages: [],
    };
    const author = userById.get(message.authorId);
    conversation.messages.push({
      id: message.id,
      author: author?.name ?? "",
      role: author?.role ?? "",
      text: message.body,
      time: message.createdAt,
    });
    groups.set(key, conversation);
  }
  return [...groups.values()];
}

function hrefFor(store: StoreData, targetType: string, targetId: string): string {
  if (targetType === "purchase-order") {
    const order = store.purchaseOrders.find((item) => item.id === targetId);
    return order ? `/purchases/${order.number}` : "/purchases";
  }
  if (targetType === "shipment") {
    const shipment = store.shipments.find((item) => item.id === targetId);
    if (!shipment) return "/containers";
    return shipment.direction === "inbound" ? `/containers/${shipment.reference}` : `/outbound/${shipment.reference}`;
  }
  if (targetType === "request") {
    const request = store.requests.find((item) => item.id === targetId) as RequestRecord | undefined;
    const shipment = request ? store.shipments.find((item) => item.id === request.shipmentId) : undefined;
    if (!shipment) return "/dashboard";
    return shipment.direction === "inbound" ? `/containers/${shipment.reference}` : `/outbound/${shipment.reference}`;
  }
  return "/dashboard";
}
