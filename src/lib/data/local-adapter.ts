/**
 * TEMPORARY: LocalAdapter implementation for Phases 1-9.
 * This adapter persists to local storage / JSON store without sample records.
 * In Phase 10 (Supabase Phase), this file will be replaced by the Postgres/Supabase adapter
 * implementing the same typed repository and service interfaces from src/lib/data/interfaces.ts.
 */

import { randomUUID } from "node:crypto";
import {
  applyCommand,
  applyStockMovement,
  approveRequest,
  assignRequestWorker,
  completeRequest,
  declineRequest,
  deletePurchaseOrder,
  sendBackRequest,
  sessionProfile,
  profile,
  signInUser,
  signOutUser,
  softDeleteRequest,
  createGeneralRequest,
  decideGeneralRequest,
  softDeleteGeneralRequest,
  createOffer,
  editOffer,
  softDeleteOffer,
  submitOfferForReview,
  decideOffer,
  updateOfferStatus,
  toggleOfferFavourite,
  addOfferComment,
  addOfferAttachment,
  deleteOfferAttachment,
  deactivateByEmail,
  transferStock,
  postCorrection,
  checkInventoryConsistency,
  createUploadTarget,
  confirmUpload,
  submitRequestWithPendingPhotos,
  cleanupExpiredPendingUploads,
} from "../../domain/commands.ts";
import { fileSignatureMatches, signedFileUrl } from "../../domain/files.ts";
import { projectStore } from "../../domain/project.ts";
import { seedStore } from "../../domain/seed.ts";
import type { StoreData, UserProfile, UserRecord } from "../../domain/schemas.ts";
import { storePath, withStore } from "../../domain/store.ts";
import { emptyWorkspace, visibleOffers, type Actor, type WorkspaceState } from "../../domain/view.ts";
import { isActiveRole } from "../permissions.ts";
import type { Services } from "./interfaces.ts";
import { can, type Action, type Resource } from "./permissions.ts";
import { getDataAdapterMode } from "../supabase/config.ts";
import { createSupabaseAdapter, type SupabaseAdapter } from "./supabase-adapter.ts";

export type DataAdapter = LocalAdapter | SupabaseAdapter;

export type WorkspaceResponse = {
  state: WorkspaceState;
  actor: Actor | null;
  error?: string;
  notice?: string;
};

export class LocalAdapter {
  private readonly file: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => string;

  constructor(file: string, env: NodeJS.ProcessEnv, now: () => string) {
    this.file = file;
    this.env = env;
    this.now = now;
  }

  private async edit<T>(fn: (store: StoreData) => T): Promise<T> {
    return withStore(this.file, (store) => {
      const seeded = seedStore(store, this.env, this.now(), randomUUID);
      if (!seeded.ok) throw new Error(seeded.error);
      cleanupExpiredPendingUploads(store, this.now());
      return fn(store);
    });
  }

  async snapshot(sessionId?: string | null): Promise<StoreData> {
    void sessionId;
    return this.edit((store) => structuredClone(store));
  }

  async view(sessionId: string | null): Promise<{ state: WorkspaceState; actor: Actor | null }> {
    const now = this.now();
    let actor: Actor | null = null;
    let currentUserId: string | null = null;
    const store = await this.edit((current) => {
      const user = sessionId ? userFromSession(current, sessionId, now) : null;
      if (user && isActiveRole(user.role)) {
        actor = toActor(current, user);
        currentUserId = user.id;
      }
      return structuredClone(current);
    });
    if (!actor) {
      return { state: emptyWorkspace(), actor: null };
    }
    const state = projectStore(store, now);
    if ((actor as Actor).role === "worker") {
      state.generalRequests = state.generalRequests.filter(
        (r) => (currentUserId ? r.createdBy === currentUserId : r.createdByName === (actor as Actor).name),
      );
    }
    state.offers = visibleOffers(state, actor);
    return { state, actor };
  }

  async run(sessionId: string | null, name: string, payload: unknown): Promise<WorkspaceResponse> {
    const now = this.now();
    let actor: Actor | null = null;
    let error: string | undefined;
    let notice: string | undefined;
    try {
      await this.edit((store) => {
        const user = sessionId ? userFromSession(store, sessionId, now) : null;
        if (!user) {
          error = "Sign in again to continue.";
          return;
        }
        if (!user.active || !isActiveRole(user.role)) {
          error = "This account is not permitted to perform actions.";
          return;
        }
        actor = toActor(store, user);
        const backup = structuredClone(store);
        const result = applyCommand(store, user, name, payload, now);
        if (result.error) {
          Object.assign(store, backup);
        }
        error = result.error;
        notice = result.notice;
      });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "The warehouse store rejected that change.";
    }
    const viewed = await this.view(sessionId);
    return { state: viewed.state, actor: viewed.actor ?? actor, error, notice };
  }

  async signIn(email: string, password: string) {
    const now = this.now();
    return this.edit((store) => signInUser(store, email, password, now));
  }

  async signOut(sessionId: string) {
    await this.edit((store) => {
      signOutUser(store, sessionId);
    });
  }

  async current(sessionId: string): Promise<UserProfile | null> {
    const now = this.now();
    return this.edit((store) => sessionProfile(store, sessionId, now));
  }

  async openFile(key: string, exp: string, sig: string, nowMs: number, sessionId?: string | null) {
    void sessionId;
    const store = await this.snapshot();
    if (!fileSignatureMatches(store.fileSecret, key, exp, sig, nowMs)) return null;
    const blob = store.blobs.find((item) => item.key === key);
    if (!blob) return null;
    return { name: blob.name, mime: blob.mime || "application/octet-stream", bytes: Buffer.from(blob.bytesBase64, "base64") };
  }

  services(): Services {
    const now = () => this.now();

    const authorize = (actor: UserRecord, action: Action, resource?: Resource): void => {
      if (!can(actor, action, resource)) {
        throw new Error("You do not have permission to perform this action.");
      }
    };

    return {
      users: {
        list: async () => (await this.snapshot()).users.map(profile),
        create: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "user:manage");
            const result = applyCommand(store, actor, "addUser", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const created = store.users.find((item) => item.email.toLowerCase() === input.email.toLowerCase());
            const temporaryPassword = result.notice?.split("Temporary password: ")[1] ?? "";
            return created
              ? { ok: true as const, value: { profile: profile(created), temporaryPassword } }
              : { ok: false as const, error: "The user was not created." };
          }),
        updateRole: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "user:manage");
            const result = applyCommand(store, actor, "changeRole", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const updated = store.users.find((item) => item.email.toLowerCase() === input.email.toLowerCase());
            return updated ? { ok: true as const, value: profile(updated) } : { ok: false as const, error: "That user does not exist." };
          }),
        deactivate: async (input) => this.deactivate(input.actorId, input.email),
      },
      auth: {
        signIn: (email, password) =>
          this.signIn(email, password).then((result) =>
            result.ok ? { ok: true as const, value: { sessionId: result.value.sessionId, profile: result.value.profile } } : result,
          ),
        signOut: (sessionId) => this.signOut(sessionId),
        currentSession: (sessionId) => this.current(sessionId),
        createUser: async (input) => this.services().users.create(input),
        deactivateUser: async (input) => this.deactivate(input.actorId, input.email),
      },
      purchaseOrders: {
        list: async () => (await this.snapshot()).purchaseOrders,
        lines: async (purchaseOrderId) => (await this.snapshot()).purchaseOrderLines.filter((item) => item.purchaseOrderId === purchaseOrderId),
        create: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "order:create");
            const result = applyCommand(store, actor, "createPurchase", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const order = store.purchaseOrders[store.purchaseOrders.length - 1];
            return order ? { ok: true as const, value: order } : { ok: false as const, error: "Order was not created." };
          }),
        submit: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "order:submit");
            const result = applyCommand(store, actor, "submitOrder", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const order = store.purchaseOrders.find((item) => item.number === input.number);
            return order ? { ok: true as const, value: order } : { ok: false as const, error: "Order was not submitted." };
          }),
        approve: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "order:approve");
            const result = applyCommand(store, actor, "approve", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const order = store.purchaseOrders.find((item) => item.number === input.number);
            return order ? { ok: true as const, value: order } : { ok: false as const, error: "Order was not approved." };
          }),
        reject: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "order:reject");
            const result = applyCommand(store, actor, "reject", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const order = store.purchaseOrders.find((item) => item.number === input.number);
            return order ? { ok: true as const, value: order } : { ok: false as const, error: "Order was not rejected." };
          }),
        edit: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            const existing = store.purchaseOrders.find((item) => item.number === input.number);
            authorize(actor, "order:edit", { status: existing?.status });
            const result = applyCommand(store, actor, "editPurchase", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const order = store.purchaseOrders.find((item) => item.number === input.number);
            return order ? { ok: true as const, value: order } : { ok: false as const, error: "Order was not updated." };
          }),
        delete: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "order:delete");
            return deletePurchaseOrder(store, input.number, actor, now());
          }),
      },
      shipments: {
        list: async () => (await this.snapshot()).shipments,
        create: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "shipment:create");
            const cmd = input.direction === "inbound" ? "addInbound" : "addOutbound";
            const result = applyCommand(store, actor, cmd, input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const shipment = store.shipments.find((item) => item.reference === input.number && item.direction === input.direction);
            return shipment ? { ok: true as const, value: shipment } : { ok: false as const, error: "Shipment was not created." };
          }),
        saveMeta: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            const shipment = store.shipments.find((item) => item.reference === input.number && item.direction === input.direction);
            authorize(actor, "shipment:edit", { warehouseId: shipment?.warehouseId });
            const result = applyCommand(store, actor, "saveMeta", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            return shipment ? { ok: true as const, value: shipment } : { ok: false as const, error: "Shipment was not found." };
          }),
        advance: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            const shipment = store.shipments.find((item) => item.reference === input.number && item.direction === input.direction);
            authorize(actor, "shipment:advance", { warehouseId: shipment?.warehouseId });
            const cmd = input.direction === "inbound" ? "unload" : "dispatch";
            const result = applyCommand(store, actor, cmd, { number: input.number }, now());
            if (result.error) return { ok: false as const, error: result.error };
            return shipment ? { ok: true as const, value: shipment } : { ok: false as const, error: "Shipment was not found." };
          }),
        overrideDispatch: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "shipment:override");
            const result = applyCommand(store, actor, "overrideDispatch", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const shipment = store.shipments.find((item) => item.reference === input.number && item.direction === "outbound");
            return shipment ? { ok: true as const, value: shipment } : { ok: false as const, error: "Shipment was not found." };
          }),
      },
      requests: {
        list: async () => (await this.snapshot()).requests,
        lines: async (requestId) => (await this.snapshot()).requestLines.filter((item) => item.requestId === requestId),
        submit: async (input) =>
          this.edit((store) => {
            const shipment = store.shipments.find((item) => item.id === input.shipmentId);
            if (!shipment) return { ok: false as const, error: "That shipment does not exist." };
            const actor = store.users.find((item) => item.id === input.actorId);
            if (actor) {
              authorize(actor, "request:create", { warehouseId: shipment.warehouseId });
            }
            return submitRequestWithPendingPhotos(store, shipment, input.actorId, now());
          }),
        approve: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            const request = store.requests.find((item) => item.id === input.requestId);
            authorize(actor, "request:approve", { status: request?.status, warehouseId: request?.warehouseId });
            return approveRequest(store, input.requestId, actor, now());
          }),
        decline: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            const request = store.requests.find((item) => item.id === input.requestId);
            authorize(actor, "request:decline", { status: request?.status, warehouseId: request?.warehouseId });
            return declineRequest(store, input.requestId, actor, input.reason, now());
          }),
        sendBack: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            const request = store.requests.find((item) => item.id === input.requestId);
            authorize(actor, "request:sendBack", { status: request?.status, warehouseId: request?.warehouseId });
            return sendBackRequest(store, input.requestId, actor, input.note, now());
          }),
        complete: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            const request = store.requests.find((item) => item.id === input.requestId);
            authorize(actor, "request:complete", {
              status: request?.status === "completed" ? "approved" : request?.status,
              warehouseId: request?.warehouseId,
            });
            return completeRequest(store, input.requestId, actor, now());
          }),
        softDelete: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            const request = store.requests.find((item) => item.id === input.requestId);
            authorize(actor, "request:delete", { status: request?.status, createdBy: request?.createdBy, warehouseId: request?.warehouseId });
            return softDeleteRequest(store, input.requestId, actor, now());
          }),
        assignWorker: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "worker:assign");
            return assignRequestWorker(store, input.requestId, input.workerId, actor, now());
          }),
      },
      generalRequests: {
        list: async (actorId?: string) => {
          const snapshot = await this.snapshot();
          if (actorId) {
            const user = snapshot.users.find((u) => u.id === actorId);
            if (user?.role === "worker") {
              return (snapshot.workerGeneralRequests || []).filter((r) => r.createdBy === actorId && r.status !== "deleted");
            }
          }
          return (snapshot.workerGeneralRequests || []).filter((r) => r.status !== "deleted");
        },
        attachments: async (requestId: string) => {
          const snapshot = await this.snapshot();
          return (snapshot.workerGeneralRequestAttachments || []).filter((att) => att.generalRequestId === requestId);
        },
        create: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            return createGeneralRequest(store, actor, input, now());
          }),
        decide: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            return decideGeneralRequest(store, actor, input, now());
          }),
        softDelete: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            return softDeleteGeneralRequest(store, actor, input.requestId, now());
          }),
      },
      offers: {
        list: async (filter, actorId) => {
          const snapshot = await this.snapshot();
          if (actorId) {
            const user = snapshot.users.find((u) => u.id === actorId);
            if (user && user.role !== "owner" && user.role !== "moderator") {
              return { items: [], total: 0, page: 1, pageSize: filter?.pageSize || 25, totalPages: 0 };
            }
          }

          let items = (snapshot.offers || []).filter((o) => !o.deletedAt);
          if (filter?.kind) items = items.filter((o) => o.kind === filter.kind);
          if (filter?.status) items = items.filter((o) => o.status === filter.status);
          if (filter?.priority) items = items.filter((o) => o.priority === filter.priority);
          if (filter?.country) items = items.filter((o) => o.country.toLowerCase() === filter.country!.toLowerCase());
          if (filter?.team) items = items.filter((o) => o.team.toLowerCase() === filter.team!.toLowerCase());
          if (filter?.isFavourite !== undefined) items = items.filter((o) => o.isFavourite === filter.isFavourite);
          if (filter?.search) {
            const q = filter.search.toLowerCase().trim();
            items = items.filter(
              (o) =>
                o.number.toLowerCase().includes(q) ||
                o.material.toLowerCase().includes(q) ||
                o.materialGrade.toLowerCase().includes(q) ||
                o.country.toLowerCase().includes(q) ||
                o.team.toLowerCase().includes(q) ||
                o.description.toLowerCase().includes(q)
            );
          }

          items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

          const page = Math.max(1, filter?.page || 1);
          const pageSize = Math.max(1, filter?.pageSize || 25);
          const total = items.length;
          const totalPages = Math.ceil(total / pageSize) || 1;
          const paginated = items.slice((page - 1) * pageSize, page * pageSize);

          return { items: paginated, total, page, pageSize, totalPages };
        },
        get: async (id, actorId) => {
          const snapshot = await this.snapshot();
          if (actorId) {
            const user = snapshot.users.find((u) => u.id === actorId);
            if (user && user.role !== "owner" && user.role !== "moderator") return null;
          }
          return (snapshot.offers || []).find((o) => (o.id === id || o.number === id) && !o.deletedAt) ?? null;
        },
        attachments: async (offerId, actorId) => {
          const snapshot = await this.snapshot();
          if (actorId) {
            const user = snapshot.users.find((u) => u.id === actorId);
            if (user && user.role !== "owner" && user.role !== "moderator") return [];
          }
          return (snapshot.offerAttachments || []).filter((att) => att.offerId === offerId);
        },
        comments: async (offerId, actorId) => {
          const snapshot = await this.snapshot();
          if (actorId) {
            const user = snapshot.users.find((u) => u.id === actorId);
            if (user && user.role !== "owner" && user.role !== "moderator") return [];
          }
          return (snapshot.offerComments || []).filter((c) => c.offerId === offerId);
        },
        activities: async (offerId, actorId) => {
          const snapshot = await this.snapshot();
          if (actorId) {
            const user = snapshot.users.find((u) => u.id === actorId);
            if (user && user.role !== "owner" && user.role !== "moderator") return [];
          }
          return (snapshot.offerActivities || []).filter((act) => act.offerId === offerId);
        },
        create: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "offer:create");
            return createOffer(store, actor, input, now());
          }),
        edit: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "offer:edit");
            return editOffer(store, actor, input, now());
          }),
        delete: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "offer:delete");
            return softDeleteOffer(store, actor, input.id, now());
          }),
        submitReview: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "offer:submit");
            return submitOfferForReview(store, actor, input.id, now());
          }),
        decide: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            if (input.decision === "approved") authorize(actor, "offer:approve");
            else authorize(actor, "offer:reject");
            return decideOffer(store, actor, input.id, input.decision, input.decisionNote, now());
          }),
        updateStatus: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "offer:status");
            return updateOfferStatus(store, actor, input.id, input.status, now());
          }),
        toggleFavourite: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            return toggleOfferFavourite(store, actor, input.id, now());
          }),
        addComment: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "offer:comment");
            return addOfferComment(store, actor, input.id, input.comment, now());
          }),
        addAttachment: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "offer:attach");
            return addOfferAttachment(store, actor, input.id, input, now());
          }),
        deleteAttachment: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "offer:attach");
            return deleteOfferAttachment(store, actor, input.id, input.attachmentId, now());
          }),
      },
      inventory: {
        balances: async () => (await this.snapshot()).stockBalances,
        movements: async () => (await this.snapshot()).stockMovements,
        setThreshold: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "threshold:set");
            const result = applyCommand(store, actor, "setThreshold", { id: input.materialId, minimum: input.lowStockThresholdKg }, now());
            if (result.error) return { ok: false as const, error: result.error };
            const material = store.materials.find((item) => item.id === input.materialId);
            return material ? { ok: true as const, value: material } : { ok: false as const, error: "That material does not exist." };
          }),
        applyMovement: async (input) =>
          this.edit((store) => {
            const actor = store.users.find((item) => item.id === input.actorId);
            if (actor) {
              authorize(actor, "stock:move", { warehouseId: input.warehouseId });
            }
            return applyStockMovement(store, input, now());
          }),
        transferStock: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "stock:transfer");
            return transferStock(store, { ...input, actor }, now());
          }),
        postCorrection: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "stock:adjust");
            return postCorrection(store, { ...input, actor }, now());
          }),
        checkConsistency: async (actorId) => {
          if (actorId) {
            const actor = (await this.snapshot()).users.find((u) => u.id === actorId);
            if (actor) authorize(actor, "stock:view");
          }
          return checkInventoryConsistency(await this.snapshot());
        },
      },
      documents: { list: async () => (await this.snapshot()).documents },
      customs: {
        list: async () => (await this.snapshot()).customsRecords,
        save: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "customs:edit");
            const result = applyCommand(store, actor, "saveCustoms", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const record = store.customsRecords.find((item) => {
              const shipment = store.shipments.find((s) => s.reference === input.number && s.direction === "outbound");
              return shipment && item.shipmentId === shipment.id;
            });
            return record ? { ok: true as const, value: record } : { ok: false as const, error: "Customs record not found." };
          }),
        confirmSeller: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            const shipment = store.shipments.find((item) => item.reference === input.number && item.direction === "outbound");
            const order = shipment?.purchaseOrderId ? store.purchaseOrders.find((p) => p.id === shipment.purchaseOrderId) : null;
            authorize(actor, "seller:confirm", { companyId: order?.companyId });
            const result = applyCommand(store, actor, "confirmSeller", { number: input.number }, now());
            if (result.error) return { ok: false as const, error: result.error };
            return shipment ? { ok: true as const, value: shipment } : { ok: false as const, error: "Shipment not found." };
          }),
        confirmCustoms: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "customs:confirm");
            const result = applyCommand(store, actor, "confirmCustoms", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const record = store.customsRecords.find((item) => {
              const shipment = store.shipments.find((s) => s.reference === input.number && s.direction === "outbound");
              return shipment && item.shipmentId === shipment.id;
            });
            return record ? { ok: true as const, value: record } : { ok: false as const, error: "Customs record not found." };
          }),
      },
      demurrage: { list: async () => (await this.snapshot()).demurrageRecords },
      annex7: {
        list: async () => (await this.snapshot()).annex7Records,
        upload: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "annex7:upload");
            const result = applyCommand(store, actor, "addAnnex", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const annex = store.annex7Records.find((item) => item.reference === input.reference);
            return annex ? { ok: true as const, value: annex } : { ok: false as const, error: "Annex 7 was not saved." };
          }),
        review: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "annex7:review");
            const result = applyCommand(store, actor, "reviewAnnex", { id: input.id }, now());
            if (result.error) return { ok: false as const, error: result.error };
            const annex = store.annex7Records.find((item) => item.id === input.id || item.documentId === input.id);
            return annex ? { ok: true as const, value: annex } : { ok: false as const, error: "Annex 7 was not found." };
          }),
        approve: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "annex7:approve");
            const result = applyCommand(store, actor, "approveAnnex", { id: input.id }, now());
            if (result.error) return { ok: false as const, error: result.error };
            const annex = store.annex7Records.find((item) => item.id === input.id || item.documentId === input.id);
            return annex ? { ok: true as const, value: annex } : { ok: false as const, error: "Annex 7 was not found." };
          }),
      },
      chat: {
        list: async () => (await this.snapshot()).poMessages,
        send: async (input) =>
          this.edit((store) => {
            const actor = store.users.find((item) => item.id === input.authorId);
            if (actor) {
              const order = input.purchaseOrderId ? store.purchaseOrders.find((p) => p.id === input.purchaseOrderId) : null;
              authorize(actor, "chat:send", { scope: input.scope, companyId: order?.companyId });
            }
            store.poMessages.push({
              id: randomUUID(),
              purchaseOrderId: input.purchaseOrderId,
              scope: input.scope,
              authorId: input.authorId,
              body: input.body,
              createdAt: now(),
            });
            return { ok: true as const, value: store.poMessages[store.poMessages.length - 1] };
          }),
      },
      audit: { list: async () => (await this.snapshot()).auditLog },
      reports: {
        stock: async () => {
          const store = await this.snapshot();
          return store.stockBalances.map((balance) => ({
            materialId: balance.materialId,
            warehouseId: balance.warehouseId,
            weightKg: balance.weightKg,
            lowStockThresholdKg: store.materials.find((item) => item.id === balance.materialId)?.lowStockThresholdKg ?? 0,
          }));
        },
        purchases: async () => {
          const store = await this.snapshot();
          return {
            count: store.purchaseOrders.length,
            quantityKg: store.purchaseOrderLines.reduce((sum, line) => sum + line.quantityKg, 0),
            valueEur: store.purchaseOrders.reduce((sum, order) => sum + order.valueEur, 0),
          };
        },
        movements: async () => (await this.snapshot()).stockMovements,
      },
      files: {
        put: async (input) =>
          this.edit((store) => {
            const key = randomUUID();
            store.blobs.push({ key, name: input.name, mime: input.mime, bytesBase64: input.bytes.toString("base64") });
            return { ok: true as const, value: { key } };
          }),
        signedUrl: async (key) => {
          const store = await this.snapshot();
          if (!store.blobs.some((item) => item.key === key)) return { ok: false as const, error: "That file does not exist." };
          return { ok: true as const, value: signedFileUrl(store.fileSecret, key, now()) };
        },
        delete: async (key) =>
          this.edit((store) => {
            const fallbackUserId = store.users.find((u) => u.role === "owner")?.id || store.users[0]?.id || randomUUID();
            const doc = store.documents.find((d) => d.storageKey === key || d.id === key);
            if (doc) {
              store.documents = store.documents.filter((d) => d.id !== doc.id);
              store.requestPhotos = store.requestPhotos.filter((rp) => rp.documentId !== doc.id);
              store.blobs = store.blobs.filter((b) => b.key !== doc.storageKey);
              store.auditLog.push({
                id: randomUUID(),
                userId: doc.createdBy || fallbackUserId,
                action: "file-deleted",
                targetType: "document",
                targetId: doc.id,
                oldValue: null,
                newValue: `${doc.readableName || doc.name} was deleted.`,
                createdAt: now(),
              });
            } else {
              store.blobs = store.blobs.filter((item) => item.key !== key);
              store.auditLog.push({
                id: randomUUID(),
                userId: fallbackUserId,
                action: "file-deleted",
                targetType: "document",
                targetId: randomUUID(),
                oldValue: null,
                newValue: `Blob ${key} was deleted.`,
                createdAt: now(),
              });
            }
            return { ok: true as const, value: undefined };
          }),
        createUploadTarget: async (metadata) =>
          this.edit((store) => {
            const actor = store.users.find((u) => u.id === metadata.actorId) ?? null;
            return createUploadTarget(store, actor, metadata, now());
          }),
        confirmUpload: async (input) =>
          this.edit((store) => {
            const actor = store.users.find((u) => u.id === input.actorId) ?? null;
            return confirmUpload(store, actor, input, now());
          }),
      },
      directory: {
        warehouses: async () => (await this.snapshot()).warehouses,
        companies: async () => (await this.snapshot()).companies,
        materials: async () => (await this.snapshot()).materials,
        packagingTypes: async () => (await this.snapshot()).packagingTypes,
        addPackagingType: async (input) =>
          this.withActor(input.actorId, (store, actor) => {
            authorize(actor, "packaging:manage");
            const result = applyCommand(store, actor, "addPackagingType", input, now());
            if (result.error) return { ok: false as const, error: result.error };
            const type = store.packagingTypes.find((item) => item.name.toLowerCase() === input.label.toLowerCase());
            return type ? { ok: true as const, value: type } : { ok: false as const, error: "Packaging type was not added." };
          }),
      },
    };
  }

  private async deactivate(actorId: string, email: string) {
    const now = this.now();
    return this.edit((store) => {
      const actor = store.users.find((item) => item.id === actorId);
      if (!actor) return { ok: false as const, error: "Sign in again to continue." };
      if (!can(actor, "user:manage")) return { ok: false as const, error: "Only the owner can deactivate a user." };
      return deactivateByEmail(store, actor, email, now);
    });
  }

  private async withActor<T>(actorId: string, fn: (store: StoreData, actor: UserRecord) => T): Promise<T> {
    return this.edit((store) => {
      const actor = store.users.find((item) => item.id === actorId);
      if (!actor || !actor.active || !isActiveRole(actor.role)) {
        throw new Error("Sign in again to continue.");
      }
      const backup = structuredClone(store);
      const res = fn(store, actor);
      if (res && typeof res === "object" && "ok" in res && (res as { ok: boolean }).ok === false) {
        Object.assign(store, backup);
      }
      return res;
    });
  }
}

function userFromSession(store: StoreData, sessionId: string, now: string): UserRecord | null {
  const current = sessionProfile(store, sessionId, now);
  if (!current) return null;
  return store.users.find((item) => item.id === current.id) ?? null;
}

function toActor(store: StoreData, user: UserRecord): Actor {
  return {
    name: user.name,
    role: user.role,
    email: user.email,
    warehouse: user.warehouseId ? (store.warehouses.find((item) => item.id === user.warehouseId)?.name ?? null) : null,
    company: user.companyId ? (store.companies.find((item) => item.id === user.companyId)?.name ?? null) : null,
  };
}

let singleton: LocalAdapter | undefined;
let supabaseSingleton: SupabaseAdapter | undefined;

export function createLocalAdapter(
  file: string,
  env: NodeJS.ProcessEnv = process.env,
  now: () => string = () => new Date().toISOString(),
): LocalAdapter {
  return new LocalAdapter(file, env, now);
}

export function getDataAdapter(env: NodeJS.ProcessEnv = process.env): DataAdapter {
  if (getDataAdapterMode(env) === "supabase") {
    if (env === process.env) {
      supabaseSingleton ??= createSupabaseAdapter(env);
      return supabaseSingleton;
    }
    return createSupabaseAdapter(env);
  }
  singleton ??= createLocalAdapter(storePath());
  return singleton;
}

export function getServices(env: NodeJS.ProcessEnv = process.env): Services {
  return getDataAdapter(env).services();
}
