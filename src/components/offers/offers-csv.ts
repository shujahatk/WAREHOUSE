import type { OfferView } from "@/domain/view";

/**
 * Exports an array of OfferView records to a downloadable CSV file.
 */
export function exportOffersToCsv(offers: OfferView[], filename = "rm-offers-export.csv"): void {
  if (!offers || offers.length === 0) {
    alert("No offers available to export.");
    return;
  }

  const headers = [
    "Offer #",
    "Kind",
    "Status",
    "Priority",
    "Approval Status",
    "Material",
    "Grade",
    "Quantity",
    "Unit",
    "Price Per Unit",
    "Currency",
    "Total Value",
    "Truckloads",
    "Country",
    "Location",
    "Buyer (Client)",
    "Buyer Contact",
    "Buyer Email",
    "Sender (Originator / Submitter)",
    "Origin Loading (Sender)",
    "Destination (Buyer)",
    "Linked PO",
    "Created At",
    "Sold At",
  ];

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = offers.map((o) => [
    escapeCell(o.number),
    escapeCell(o.kind === "purchasing" ? "Purchasing" : "Selling"),
    escapeCell(o.status),
    escapeCell(o.priority),
    escapeCell(o.approvalStatus || "pending"),
    escapeCell(o.material),
    escapeCell(o.materialGrade || ""),
    escapeCell(o.quantity),
    escapeCell(o.unit),
    escapeCell(o.pricePerUnit),
    escapeCell(o.currency),
    escapeCell(o.totalValue),
    escapeCell(o.truckLoads),
    escapeCell(o.country),
    escapeCell(o.location || ""),
    escapeCell(o.clientName || o.buyerName || ""),
    escapeCell(o.contactNumber || ""),
    escapeCell(o.emailAddress || ""),
    escapeCell(o.createdByName || o.senderName || ""),
    escapeCell(o.origin || o.location || ""),
    escapeCell(o.destination || ""),
    escapeCell(o.poNumber || ""),
    escapeCell(o.createdAt?.slice(0, 10) || ""),
    escapeCell(o.soldAt?.slice(0, 10) || ""),
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

