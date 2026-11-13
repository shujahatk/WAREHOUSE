"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadWorkspace, runCommand, signOutAction } from "@/domain/actions";
import { emptyWorkspace, type Actor, type DemoDocument, type DemoState, type GeneralRequestOperationalDetails } from "@/domain/view";
import type { Role } from "@/lib/permissions";

let authEpochCounter = 0;
const authListeners = new Set<() => void>();

export function notifyAuthChanged(): void {
  authEpochCounter += 1;
  for (const listener of authListeners) {
    try {
      listener();
    } catch {}
  }
}

type Text = Promise<string | undefined>;

export type WorkspaceApi = {
  state: DemoState;
  actor: Actor | null;
  ready: boolean;
  setActor: (actor: Actor | null) => void;
  signOut: () => Promise<void>;
  approve: (number: string) => Text;
  reject: (number: string) => Text;
  editPurchase: (number: string, draft: { supplier: string; material: string; quantityKg: number; valueEur: number; title?: string; notes?: string }) => Text;
  createPurchase: (draft: { supplier: string; material: string; quantityKg: number; valueEur: number; title?: string; number?: string; notes?: string }) => Text;
  unload: (number: string) => Text;
  dispatch: (number: string) => Text;
  saveCustoms: (draft: { number: string; reference: string; procedureNote: string; goodsDescription: string; declarantReference: string }) => Text;
  confirmSeller: (number: string) => Text;
  confirmCustoms: (draft: { number: string; name: string; mime: string; size: number; bytesBase64: string; fileId?: string }) => Text;
  saveCmr: (draft: { shipment: string; direction: "inbound" | "outbound"; reference: string; carrier: string; goodsDescription: string; remarks: string }) => Text;
  setThreshold: (draft: { id: string; minimum: number }) => Text;
  messageSeller: (po: string, text: string) => Text;
  overrideDispatch: (draft: { number: string; reason: string }) => Text;
  saveMaterial: (draft: {
    shipment: string;
    direction: "inbound" | "outbound";
    material: string;
    mode: "weight" | "count";
    grossKg: number | null;
    packagingId: string;
    packagingQty: number | null;
    tarePerUnitKg: number | null;
    noTare: boolean;
    count: number | null;
  }) => Text;
  deleteMaterial: (direction: "inbound" | "outbound", shipment: string, sectionId: string) => Text;
  saveMeta: (draft: { direction: "inbound" | "outbound"; number: string; po: string; container: string; party: string }) => Text;
  addInbound: (draft: { number: string; po: string; supplier: string; warehouse: string }) => Text;
  addOutbound: (draft: { number: string; po: string; container: string; customer: string; warehouse: string }) => Text;
  attachFile: (draft: { id: string; shipment: string; direction: "inbound" | "outbound"; name: string; mime: string; size: number; role: "cmr" | "photo"; bytesBase64: string }) => Text;
  attachFiles: (drafts: { id: string; shipment: string; direction: "inbound" | "outbound"; name: string; mime: string; size: number; role: "cmr" | "photo"; bytesBase64: string }[]) => Text;
  detachFile: (id: string) => Text;
  addPackagingType: (draft: { label: string; tareKg: number | null }) => Text;
  transfer: (input: { clientKey: string; from: string; to: string; material: string; quantity: number }) => Text;
  message: (conversationId: string, text: string) => Text;
  messagePo: (po: string, text: string) => Text;
  submitOrder: (draft: { number: string; notes: string }) => Text;
  saveCarrier: (draft: { number: string; carrier: string; handover: string }) => Text;
  addUser: (draft: { name: string; email: string; role: Role; warehouse: string | null; company?: string | null }) => Text;
  changeRole: (email: string, role: Role, warehouse: string | null, company?: string | null) => Text;
  selectDocument: (draft: { id: string; name: string; category: DemoDocument["category"]; mime: string; size: number; bytesBase64: string }) => Text;
  addAnnex: (draft: { id: string; reference: string; shipment: string; direction: "inbound" | "outbound"; name: string; mime: string; size: number; notes: string; bytesBase64: string; fileId?: string }) => Text;
  reviewAnnex: (id: string) => Text;
  approveAnnex: (id: string) => Text;
  approveRequest: (requestId: string) => Text;
  declineRequest: (requestId: string, reason: string) => Text;
  sendBackRequest: (requestId: string, note: string) => Text;
  completeRequest: (requestId: string) => Text;
  deleteRequest: (requestId: string) => Text;
  createRequest: (direction: "inbound" | "outbound", shipment: string) => Text;
  createGeneralRequest: (draft: {
    category: string;
    priority?: string;
    description: string;
    shipmentId?: string | null;
    attachments?: { name: string; bytesBase64: string }[];
    documentIds?: string[];
    operationalDetails?: GeneralRequestOperationalDetails;
  }) => Text;
  decideGeneralRequest: (draft: {
    requestId: string;
    decision: "under_review" | "approved" | "declined" | "sent_back" | "completed";
    responseNote?: string;
    reason?: string;
    note?: string;
  }) => Text;
  assignPoSoToGeneralRequest: (draft: {
    requestId: string;
    poSoNumber: string;
    notes?: string;
  }) => Text;
  deleteGeneralRequest: (requestId: string) => Text;
  createOffer: (draft: Record<string, unknown>) => Text;
  editOffer: (draft: Record<string, unknown>) => Text;
  deleteOffer: (id: string) => Text;
  submitOffer: (id: string) => Text;
  decideOffer: (draft: { id: string; decision: "approved" | "rejected"; note: string }) => Text;
  updateOfferStatus: (draft: { id: string; status: string }) => Text;
  toggleOfferFavourite: (id: string) => Text;
  addOfferComment: (draft: { id: string; comment: string }) => Text;
  addOfferAttachment: (draft: { id: string; name: string; mime?: string; bytesBase64?: string; kind?: "image" | "document" }) => Text;
  deleteOfferAttachment: (draft: { id: string; attachmentId: string }) => Text;
  markNotificationRead: (id: string) => Text;
  markAllNotificationsRead: () => Text;
  refresh: () => Promise<void>;
  reset: () => Text;
  notice: string | null;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
};

const WorkspaceContext = createContext<WorkspaceApi | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(emptyWorkspace());
  const [actor, setActor] = useState<Actor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [syncedEpoch, setSyncedEpoch] = useState<number>(() => authEpochCounter);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const lastRevisionRef = useRef<string>("");
  const channelRef = useRef<BroadcastChannel | null>(null);

  const fetchWorkspaceState = useCallback(async (targetEpoch?: number) => {
    const epochToCommit = targetEpoch ?? authEpochCounter;
    try {
      const result = await loadWorkspace();
      setState(result.state);
      setActor(result.actor);
      setSyncedEpoch(epochToCommit);
      setReady(true);
      setLastSyncedAt(new Date());
    } catch {
      setSyncedEpoch(epochToCommit);
      setReady(true);
    }
  }, []);

  useLayoutEffect(() => {
    let active = true;
    const currentEpoch = authEpochCounter;
    void loadWorkspace().then((result) => {
      if (!active) return;
      setState(result.state);
      setActor(result.actor);
      setSyncedEpoch(currentEpoch);
      setReady(true);
      setLastSyncedAt(new Date());
    }).catch(() => {
      if (!active) return;
      setSyncedEpoch(currentEpoch);
      setReady(true);
    });
    return () => {
      active = false;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const handleAuthChange = () => {
      if (!active) return;
      setReady(false);
      void fetchWorkspaceState(authEpochCounter);
    };
    authListeners.add(handleAuthChange);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("stockflow-sync");
      channelRef.current = bc;
      bc.onmessage = (event) => {
        if (event?.data?.type === "store_updated" || event?.data?.type === "auth_changed") {
          if (event?.data?.type === "auth_changed") {
            setReady(false);
          }
          void loadWorkspace().then((result) => {
            if (!active) return;
            setState(result.state);
            setActor(result.actor);
            setSyncedEpoch(authEpochCounter);
            setReady(true);
            setLastSyncedAt(new Date());
          });
        }
      };
    } catch {}

    const checkSync = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/inventory/sync", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && data.revision) {
          if (lastRevisionRef.current && lastRevisionRef.current !== data.revision) {
            setIsSyncing(true);
            const result = await loadWorkspace();
            if (active) {
              setState(result.state);
              setActor(result.actor);
              setLastSyncedAt(new Date());
            }
            setIsSyncing(false);
          }
          lastRevisionRef.current = data.revision;
        }
      } catch {}
    };

    const interval = setInterval(checkSync, 10000);
    const onFocus = () => {
      void checkSync();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }

    return () => {
      active = false;
      authListeners.delete(handleAuthChange);
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
      try {
        bc?.close();
      } catch {}
    };
  }, [fetchWorkspaceState]);

  const effectiveReady = ready && syncedEpoch === authEpochCounter;

  const api = useMemo<WorkspaceApi>(() => {
    const run = async (name: string, payload: unknown = {}): Promise<string | undefined> => {
      setIsSyncing(true);
      try {
        const result = await runCommand(name, payload);
        setState(result.state);
        if (result.actor) setActor(result.actor);
        setLastSyncedAt(new Date());
        try {
          channelRef.current?.postMessage({ type: "store_updated", command: name });
        } catch {}
        if (result.error) {
          setNotice(result.error);
          return result.error;
        }
        setNotice(result.notice ?? null);
        return undefined;
      } finally {
        setIsSyncing(false);
      }
    };
    return {
      state,
      actor,
      ready: effectiveReady,
      setActor,
      notice,
      isSyncing,
      lastSyncedAt,
      signOut: async () => {
        setReady(false);
        setActor(null);
        setState(emptyWorkspace());
        setNotice(null);
        lastRevisionRef.current = "";
        await signOutAction();
        authEpochCounter += 1;
        setSyncedEpoch(authEpochCounter);
        try {
          channelRef.current?.postMessage({ type: "auth_changed" });
        } catch {}
      },
      approve: (number) => run("approve", { number }),
      reject: (number) => run("reject", { number }),
      editPurchase: (number, draft) => run("editPurchase", { number, ...draft }),
      createPurchase: (draft) => run("createPurchase", draft),
      unload: (number) => run("unload", { number }),
      dispatch: (number) => run("dispatch", { number }),
      saveCustoms: (draft) => run("saveCustoms", draft),
      confirmSeller: (number) => run("confirmSeller", { number }),
      confirmCustoms: (draft) => run("confirmCustoms", draft),
      saveCmr: (draft) => run("saveCmr", draft),
      setThreshold: (draft) => run("setThreshold", draft),
      messageSeller: (po, text) => run("messageSeller", { po, text }),
      overrideDispatch: (draft) => run("overrideDispatch", draft),
      saveMaterial: (draft) => run("saveMaterial", draft),
      deleteMaterial: (direction, shipment, sectionId) => run("deleteMaterial", { direction, shipment, sectionId }),
      saveMeta: (draft) => run("saveMeta", draft),
      addInbound: (draft) => run("addInbound", draft),
      addOutbound: (draft) => run("addOutbound", draft),
      attachFile: (draft) => run("attachFile", draft),
      attachFiles: (drafts) => run("attachFiles", drafts),
      detachFile: (id) => run("detachFile", { id }),
      addPackagingType: (draft) => run("addPackagingType", draft),
      transfer: (input) => run("transfer", input),
      message: (conversationId, text) => run("message", { conversationId, text }),
      messagePo: (po, text) => run("messagePo", { po, text }),
      submitOrder: (draft) => run("submitOrder", draft),
      saveCarrier: (draft) => run("saveCarrier", draft),
      addUser: (draft) => run("addUser", draft),
      changeRole: (email, role, warehouse, company) => run("changeRole", { email, role, warehouse, company }),
      selectDocument: (draft) => run("selectDocument", draft),
      addAnnex: (draft) => run("addAnnex", draft),
      reviewAnnex: (id) => run("reviewAnnex", { id }),
      approveAnnex: (id) => run("approveAnnex", { id }),
      approveRequest: (requestId) => run("approveRequest", { requestId }),
      declineRequest: (requestId, reason) => run("declineRequest", { requestId, reason }),
      sendBackRequest: (requestId, note) => run("sendBackRequest", { requestId, note }),
      completeRequest: (requestId) => run("completeRequest", { requestId }),
      deleteRequest: (requestId) => run("deleteRequest", { requestId }),
      createRequest: (direction, shipment) => run("createRequest", { direction, shipment }),
      createGeneralRequest: (draft) => run("createGeneralRequest", draft),
      decideGeneralRequest: (draft) => run("decideGeneralRequest", draft),
      assignPoSoToGeneralRequest: (draft) => run("assignPoSoToGeneralRequest", draft),
      deleteGeneralRequest: (requestId) => run("deleteGeneralRequest", { requestId }),
      createOffer: (draft) => run("createOffer", draft),
      editOffer: (draft) => run("editOffer", draft),
      deleteOffer: (id) => run("deleteOffer", { id }),
      submitOffer: (id) => run("submitOffer", { id }),
      decideOffer: (draft) => run("decideOffer", draft),
      updateOfferStatus: (draft) => run("updateOfferStatus", draft),
      toggleOfferFavourite: (id) => run("toggleOfferFavourite", { id }),
      addOfferComment: (draft) => run("addOfferComment", draft),
      addOfferAttachment: (draft) => run("addOfferAttachment", draft),
      deleteOfferAttachment: (draft) => run("deleteOfferAttachment", draft),
      markNotificationRead: (id) => run("markNotificationRead", { id }),
      markAllNotificationsRead: () => run("markAllNotificationsRead", {}),
      refresh: async () => {
        setIsSyncing(true);
        try {
          const result = await loadWorkspace();
          setState(result.state);
          setActor(result.actor);
          setSyncedEpoch(authEpochCounter);
          setReady(true);
          setLastSyncedAt(new Date());
        } finally {
          setIsSyncing(false);
        }
      },
      reset: () => run("reset"),
    };
  }, [actor, notice, effectiveReady, state, isSyncing, lastSyncedAt]);

  return <WorkspaceContext.Provider value={api}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceApi {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

export const useDemo = useWorkspace;
export const DemoProvider = WorkspaceProvider;
