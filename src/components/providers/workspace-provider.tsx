"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadWorkspace, runCommand, signOutAction } from "@/domain/actions";
import { emptyWorkspace, type Actor, type DemoDocument, type DemoState } from "@/domain/view";
import type { Role } from "@/lib/permissions";

type Text = Promise<string | undefined>;

export type WorkspaceApi = {
  state: DemoState;
  actor: Actor | null;
  ready: boolean;
  setActor: (actor: Actor | null) => void;
  signOut: () => Promise<void>;
  approve: (number: string) => Text;
  reject: (number: string) => Text;
  editPurchase: (number: string, draft: { supplier: string; material: string; quantityKg: number; valueEur: number }) => Text;
  createPurchase: (draft: { supplier: string; material: string; quantityKg: number; valueEur: number }) => Text;
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
  }) => Text;
  decideGeneralRequest: (draft: {
    requestId: string;
    decision: "under_review" | "approved" | "declined" | "sent_back" | "completed";
    responseNote?: string;
    reason?: string;
    note?: string;
  }) => Text;
  deleteGeneralRequest: (requestId: string) => Text;
  refresh: () => Promise<void>;
  reset: () => Text;
  notice: string | null;
};

const WorkspaceContext = createContext<WorkspaceApi | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(emptyWorkspace());
  const [actor, setActor] = useState<Actor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadWorkspace().then((result) => {
      if (!active) return;
      setState(result.state);
      setActor(result.actor);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const api = useMemo<WorkspaceApi>(() => {
    const run = async (name: string, payload: unknown = {}): Promise<string | undefined> => {
      const result = await runCommand(name, payload);
      setState(result.state);
      if (result.actor) setActor(result.actor);
      if (result.error) {
        setNotice(result.error);
        return result.error;
      }
      setNotice(result.notice ?? null);
      return undefined;
    };
    return {
      state,
      actor,
      ready,
      setActor,
      notice,
      signOut: async () => {
        await signOutAction();
        setActor(null);
        setState(emptyWorkspace());
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
      deleteGeneralRequest: (requestId) => run("deleteGeneralRequest", { requestId }),
      refresh: async () => {
        const result = await loadWorkspace();
        setState(result.state);
        if (result.actor) setActor(result.actor);
      },
      reset: () => run("reset"),
    };
  }, [actor, notice, ready, state]);

  return <WorkspaceContext.Provider value={api}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceApi {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

export const useDemo = useWorkspace;
export const DemoProvider = WorkspaceProvider;
