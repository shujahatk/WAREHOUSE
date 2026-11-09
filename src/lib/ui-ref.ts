export type PoStatus = "Approved" | "Pending" | "Planned" | "Rejected" | "Received";

export type PurchaseOrder = {
  number: string;
  supplier: string;
  material: string;
  quantity: string;
  quantityNumber: string;
  value: string;
  unitPrice: string;
  incoterms: string;
  status: PoStatus;
  date: string;
  created: string;
  owner: string;
  supplierEmail: string;
  forwarder: string;
  container: string;
  ship: string;
  eta: string;
  timeline: { title: string; detail: string }[];
};

export const purchaseOrders: PurchaseOrder[] = [
  {
    number: "PO213344",
    supplier: "NITTO",
    material: "LDPE ROLLEN",
    quantity: "20,000 kg",
    quantityNumber: "20,000",
    value: "€200,000",
    unitPrice: "€8.20/kg",
    incoterms: "FOB",
    status: "Approved",
    date: "20 Oct 2026",
    created: "20 Oct 2026",
    owner: "Ahmed Khan",
    supplierEmail: "supplier@nitto.com",
    forwarder: "RHM Trading",
    container: "MSKU192145",
    ship: "Ever Given",
    eta: "24 Oct 2026",
    timeline: [
      { title: "Owner approval", detail: "Ahmed Khan · 20 Oct 2026, 14:32" },
      { title: "PO submitted", detail: "Nabil Ali · 18 Oct 2026, 09:15" },
    ],
  },
  {
    number: "PO213456",
    supplier: "MRBACH",
    material: "PAPER ROLLS",
    quantity: "15,000 kg",
    quantityNumber: "15,000",
    value: "€150,000",
    unitPrice: "€10.00/kg",
    incoterms: "CIF",
    status: "Planned",
    date: "21 Oct 2026",
    created: "21 Oct 2026",
    owner: "Ahmed Khan",
    supplierEmail: "orders@mrbach.com",
    forwarder: "RHM Trading",
    container: "TCLU220188",
    ship: "MSC Maya",
    eta: "28 Oct 2026",
    timeline: [{ title: "Planned", detail: "Waiting for supplier confirmation · 21 Oct 2026" }],
  },
  {
    number: "PO213582",
    supplier: "EMUR",
    material: "METALTYE",
    quantity: "18,000 kg",
    quantityNumber: "18,000",
    value: "€180,000",
    unitPrice: "€10.00/kg",
    incoterms: "FOB",
    status: "Pending",
    date: "21 Oct 2026",
    created: "21 Oct 2026",
    owner: "Ahmed Khan",
    supplierEmail: "desk@emur.com",
    forwarder: "RHM Trading",
    container: "CMAU774120",
    ship: "CMA CGM Loire",
    eta: "2 Nov 2026",
    timeline: [{ title: "Awaiting approval", detail: "Submitted · 21 Oct 2026, 11:05" }],
  },
  {
    number: "PO213446",
    supplier: "NITTO",
    material: "LDPE ROLLEN",
    quantity: "40,000 kg",
    quantityNumber: "40,000",
    value: "€400,000",
    unitPrice: "€10.00/kg",
    incoterms: "FOB",
    status: "Pending",
    date: "21 Oct 2026",
    created: "21 Oct 2026",
    owner: "Ahmed Khan",
    supplierEmail: "supplier@nitto.com",
    forwarder: "RHM Trading",
    container: "MSKU441290",
    ship: "Ever Grade",
    eta: "4 Nov 2026",
    timeline: [{ title: "Awaiting approval", detail: "Submitted · 21 Oct 2026, 16:40" }],
  },
  {
    number: "PO213400",
    supplier: "AGFA",
    material: "PP PELLETS",
    quantity: "12,000 kg",
    quantityNumber: "12,000",
    value: "€96,000",
    unitPrice: "€8.00/kg",
    incoterms: "EXW",
    status: "Rejected",
    date: "20 Oct 2026",
    created: "19 Oct 2026",
    owner: "Ahmed Khan",
    supplierEmail: "sales@agfa.com",
    forwarder: "RHM Trading",
    container: "—",
    ship: "—",
    eta: "—",
    timeline: [{ title: "Rejected", detail: "Owner review · 20 Oct 2026, 18:02" }],
  },
];

export function findPurchaseOrder(number: string): PurchaseOrder | undefined {
  return purchaseOrders.find((order) => order.number === number);
}

export type InboundContainer = {
  number: string;
  po: string;
  supplier: string;
  origin: string;
  warehouse: string;
  status: "Unloading" | "In transit" | "Arrived" | "Loaded" | "Completed";
  eta: string;
};

export const inboundContainers: InboundContainer[] = [
  { number: "CNTR-4587", po: "PO213344", supplier: "NITTO", origin: "Japan", warehouse: "Bornem", status: "Unloading", eta: "21 Oct" },
  { number: "CNTR-4721", po: "PO213456", supplier: "MRBACH", origin: "Germany", warehouse: "Turnhout", status: "In transit", eta: "21 Oct" },
  { number: "CNTR-4410", po: "PO213400", supplier: "AGFA", origin: "Belgium", warehouse: "Bornem", status: "Arrived", eta: "20 Oct" },
  { number: "CNTR-4332", po: "PO213445", supplier: "AGFA", origin: "Belgium", warehouse: "Bornem", status: "Loaded", eta: "20 Oct" },
  { number: "CNTR-4407", po: "PO213400", supplier: "AGFA", origin: "Italy", warehouse: "Turnhout", status: "Completed", eta: "19 Oct" },
];

export const warehouses = [
  { name: "Bornem", weight: "12,450 kg" },
  { name: "Turnhout", weight: "8,230 kg" },
  { name: "Spain", weight: "6,710 kg" },
  { name: "Pakistan", weight: "4,500 kg" },
];

export const inventoryRows = [
  { material: "LDPE ROLLEN", packaging: "Cage", quantity: "25", weight: "25,000", net: "22,750", location: "B1" },
  { material: "PAPER ROLLS", packaging: "Pallet", quantity: "18", weight: "18,000", net: "17,100", location: "B2" },
  { material: "METALTYE", packaging: "Box", quantity: "10", weight: "10,000", net: "9,500", location: "A1" },
  { material: "PP PELLETS", packaging: "Big Bag", quantity: "8", weight: "8,000", net: "7,600", location: "C3" },
];

export const activity = [
  { text: "PO213456 approved by Ahmed Khan", status: "Approved", href: "/purchases/PO213456" },
  { text: "Container CNTR-4587 arrived at Bornem", status: "In transit", href: "/containers/CNTR-4587" },
  { text: "Stock transfer completed (Turnhout → Bornem)", status: "Transfer", href: "/transfers" },
  { text: "Demurrage warning: CNTR-4721 in 5h", status: "Warning", href: "/containers" },
  { text: "New message in PO213582", status: "Chat", href: "/chat" },
];

export const documents = [
  { name: "CMR · CNTR-4587", meta: "Container · 21 Oct 2026" },
  { name: "Annex 7 · PO213344", meta: "Purchase order · 20 Oct 2026" },
  { name: "Transport document", meta: "MSKU192145 · 20 Oct 2026" },
  { name: "Customs clearance", meta: "CNTR-4587 · 21 Oct 2026 · 2.4 MB" },
];

export const chatMessages = [
  { author: "Ahmed Khan", role: "Owner", text: "Please confirm the pricing for this PO.", time: "14:02" },
  { author: "Aurelia Chen", role: "Supplier", text: "The price is updated. Please review the details in the file.", time: "14:18" },
  { author: "Nabil Ali", role: "Forwarder", text: "Noted. Do you need any additional photos?", time: "14:26" },
  { author: "Ahmed Khan", role: "Owner", text: "Yes, please share the loading photos.", time: "14:31" },
];

export const tasks = [
  { title: "Pending Approvals", count: "3", href: "/purchases" },
  { title: "Unloading in progress", detail: "CNTR-4587 · Bornem", count: "2", href: "/containers/CNTR-4587" },
  { title: "Customs clearance", count: "1", href: "/documents" },
  { title: "Demurrage warning", detail: "CNTR-4721 · 5h", count: "1", href: "/containers" },
];

export const outboundShipments = [
  { number: "OUT-1184", customer: "Meridian Packaging", material: "LDPE ROLLEN", weight: "12,600 kg", warehouse: "Bornem", status: "On schedule", date: "22 Oct 2026" },
  { number: "OUT-1179", customer: "Vale Print", material: "PAPER ROLLS", weight: "8,400 kg", warehouse: "Turnhout", status: "Loading", date: "22 Oct 2026" },
  { number: "OUT-1166", customer: "Keel & Co.", material: "PP PELLETS", weight: "6,400 kg", warehouse: "Bornem", status: "Planned", date: "24 Oct 2026" },
];

export const users = [
  { name: "Ahmed Khan", role: "Owner", site: "All warehouses" },
  { name: "Nabil Ali", role: "Forwarder", site: "Bornem" },
  { name: "Aurelia Chen", role: "Supplier contact", site: "NITTO" },
  { name: "Warehouse worker", role: "Floor", site: "Bornem" },
];
