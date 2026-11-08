export type RoadmapStatus = "complete" | "in-progress" | "not-started" | "blocked";

export type RoadmapStep = {
  id: string;
  stage: string;
  title: string;
  status: RoadmapStatus;
  note: string;
};

export const ROADMAP_STEP_COUNT = 40;

export const roadmapSteps: RoadmapStep[] = [
  { id: "1.1", stage: "Stage 1 — Core operations", title: "Inbound: register, unload, and post to stock", status: "complete", note: "Net weight posts once on completion." },
  { id: "1.2", stage: "Stage 1 — Core operations", title: "Packaging tare and net weight", status: "complete", note: "Count-only sections do not deduct tare." },
  { id: "1.3", stage: "Stage 1 — Core operations", title: "Outbound with stock availability checks", status: "complete", note: "Dispatch refuses a net weight the warehouse does not hold." },
  { id: "1.4", stage: "Stage 1 — Core operations", title: "Dispatch deducts stock", status: "complete", note: "A second dispatch does not post again." },
  { id: "1.5", stage: "Stage 1 — Core operations", title: "Transfers between three warehouses", status: "complete", note: "Source decreases and destination increases once." },
  { id: "1.6", stage: "Stage 1 — Core operations", title: "Reports and CSV export", status: "complete", note: "CSV includes quantity, weight, reorder threshold, and status." },
  { id: "2.1", stage: "Stage 2 — People and access", title: "Roles: Owner, Worker, Data Entry, Management", status: "complete", note: "Customer is an additional role. Checks run in the workflow handlers." },
  { id: "2.2", stage: "Stage 2 — People and access", title: "Customers can see only their own records", status: "complete", note: "Orders, shipments, documents, and Annex 7 are filtered by company." },
  { id: "2.3", stage: "Stage 2 — People and access", title: "Workers upload photos during loading and unloading", status: "complete", note: "Photos are blocked after Completed or Dispatched. Bytes stay in this browser tab." },
  { id: "3.1", stage: "Stage 3 — Orders and chat", title: "Customer submits a purchase order number", status: "complete", note: "The order stays with that customer company." },
  { id: "3.2", stage: "Stage 3 — Orders and chat", title: "Owner approves or rejects the order", status: "complete", note: "Other roles cannot approve or reject." },
  { id: "3.3", stage: "Stage 3 — Orders and chat", title: "Customers can chat on each PO", status: "complete", note: "The thread is limited to the owner, data entry, and the owning customer." },
  { id: "3.4", stage: "Stage 3 — Orders and chat", title: "Chat with sellers", status: "complete", note: "Owner and data entry record supplier messages. The catalog room PO213344 is a purchase-order thread, and workers cannot open it." },
  { id: "4.1", stage: "Stage 4 — Customs and documents", title: "Swiss customs fields on outbound shipments", status: "complete", note: "Demo fields only. They are not a legal declaration." },
  { id: "4.2", stage: "Stage 4 — Customs and documents", title: "Seller confirmation before dispatch", status: "complete", note: "Only the matching customer company can confirm. Filling customs fields does not confirm the seller." },
  { id: "4.3", stage: "Stage 4 — Customs and documents", title: "Owner override with a mandatory reason", status: "complete", note: "Override skips incomplete customs and seller confirmation. It does not skip carrier, net weight, or stock checks." },
  { id: "4.4", stage: "Stage 4 — Customs and documents", title: "Demurrage: 120 free minutes, then €1 per additional minute", status: "complete", note: "The timer starts on the recorded move into Unloading." },
  { id: "4.5", stage: "Stage 4 — Customs and documents", title: "Annex 7 records linked to shipments with review status", status: "complete", note: "Uploaded, Under Review, and Approved stay distinct." },
  { id: "4.6", stage: "Stage 4 — Customs and documents", title: "Customs confirmation with confirmed-by details, date, and proof upload", status: "complete", note: "Provisional: owner and data entry record it. Who should confirm is still an open customer question. It does not block dispatch." },
  { id: "5.1", stage: "Stage 5 — Customer-requested features", title: "CMR data entry", status: "complete", note: "Structured demo fields save only against an attached CMR file." },
  { id: "5.2", stage: "Stage 5 — Customer-requested features", title: "Container numbers", status: "complete", note: "Inbound equipment numbers are separate from the record id. Outbound already stores a container number." },
  { id: "5.3", stage: "Stage 5 — Customer-requested features", title: "Transport handover", status: "complete", note: "Carrier is required. Status is Not recorded, Carrier recorded, or Handover recorded." },
  { id: "5.4", stage: "Stage 5 — Customer-requested features", title: "Count-only packaging mode", status: "complete", note: "Quantity is stored without tare or a weighted stock post." },
  { id: "5.5", stage: "Stage 5 — Customer-requested features", title: "Low-stock threshold per material", status: "complete", note: "The owner sets a minimum quantity on each warehouse stock row. The same material can have a different threshold at another warehouse." },
  { id: "6.1", stage: "Stage 6 — Pre-launch verification", title: "Transfers move stock exactly once", status: "complete", note: "Covered by the transfer tests." },
  { id: "6.2", stage: "Stage 6 — Pre-launch verification", title: "Packaging tare is applied once", status: "complete", note: "Covered by the packaging and posting tests." },
  { id: "6.3", stage: "Stage 6 — Pre-launch verification", title: "In-progress containers keep a real demurrage start", status: "complete", note: "A container already Unloading without a recorded start stays unstarted. A new transition stores the actual time once." },
  { id: "6.4", stage: "Stage 6 — Pre-launch verification", title: "Completing or dispatching twice does not post twice", status: "complete", note: "Covered by the inbound completion and outbound dispatch tests." },
  { id: "7.1", stage: "Stage 7 — Supabase backend", title: "Database tables and demo-data migration", status: "not-started", note: "Deferred. Not part of this demo." },
  { id: "7.2", stage: "Stage 7 — Supabase backend", title: "Real login replacing demo accounts", status: "not-started", note: "Deferred." },
  { id: "7.3", stage: "Stage 7 — Supabase backend", title: "Row-level security for roles, warehouses, and customers", status: "not-started", note: "Deferred." },
  { id: "7.4", stage: "Stage 7 — Supabase backend", title: "Persistent file storage", status: "not-started", note: "Deferred. CMR, photo, Annex 7, and customs proof bytes are lost on refresh." },
  { id: "7.5", stage: "Stage 7 — Supabase backend", title: "Safe stock posting protected against duplicate operations", status: "not-started", note: "Deferred. The demo protects duplicates only inside the current browser state." },
  { id: "7.6", stage: "Stage 7 — Supabase backend", title: "Persisted demurrage start times and charges", status: "not-started", note: "Deferred." },
  { id: "7.7", stage: "Stage 7 — Supabase backend", title: "Audit logs, including owner overrides", status: "not-started", note: "Deferred. The demo audit lives in browser state." },
  { id: "7.8", stage: "Stage 7 — Supabase backend", title: "Optional seller login", status: "not-started", note: "Deferred. Supplier messages are not a seller account." },
  { id: "8.1", stage: "Stage 8 — Customer decisions", title: "Should Management remain a separate role?", status: "blocked", note: "Currently read-only. No final answer." },
  { id: "8.2", stage: "Stage 8 — Customer decisions", title: "Can Workers also perform data entry?", status: "blocked", note: "Currently they upload photos and operate their warehouse. They do not edit identity, CMR details, or customs." },
  { id: "8.3", stage: "Stage 8 — Customer decisions", title: "Who records customs confirmation?", status: "blocked", note: "Open: the customer, or Owner and Data Entry. The capture form is provisional." },
  { id: "8.4", stage: "Stage 8 — Customer decisions", title: "Which customs details must appear on the CMR or in reports?", status: "blocked", note: "No legal field list has been confirmed." },
];

export function roadmapProgress(steps: RoadmapStep[] = roadmapSteps): { complete: number; total: number; percent: number } {
  const complete = steps.filter((step) => step.status === "complete").length;
  const total = ROADMAP_STEP_COUNT;
  return { complete, total, percent: Math.round((complete / total) * 100) };
}
