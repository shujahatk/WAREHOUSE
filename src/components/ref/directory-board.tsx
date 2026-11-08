"use client";

import { useDemo } from "@/components/providers/workspace-provider";
import { DataTable } from "@/components/ui/data-table";
import { formatKg, formatSharePercents } from "@/lib/format";
import { statusCell, textCell, type TableRecord } from "@/lib/table";

type Kind = "warehouses" | "customers" | "suppliers" | "sales" | "movements";

export function DirectoryBoard({
  kind,
  caption,
  searchPlaceholder,
  minWidthClassName,
  phoneLayout = "table",
}: {
  kind: Kind;
  caption: string;
  searchPlaceholder: string;
  minWidthClassName: string;
  phoneLayout?: "table" | "cards" | "compact";
}) {
  const { state } = useDemo();
  const rows = buildRows(kind, state);
  return (
    <DataTable
      caption={caption}
      columns={columns[kind]}
      rows={rows}
      searchPlaceholder={searchPlaceholder}
      minWidthClassName={minWidthClassName}
      phoneLayout={phoneLayout}
    />
  );
}

const columns = {
  warehouses: [
    { header: "Code" },
    { header: "Warehouse", wrap: true },
    { header: "Location", wrap: true },
    { header: "On hand", align: "right" as const },
    { header: "Capacity", align: "right" as const },
    { header: "Capacity used", align: "right" as const },
    { header: "Share of stock", align: "right" as const },
    { header: "Position" },
  ],
  customers: [{ header: "Code" }, { header: "Customer", wrap: true }, { header: "City" }, { header: "Terms" }, { header: "Open sales", align: "right" as const }],
  suppliers: [{ header: "Code" }, { header: "Supplier", wrap: true }, { header: "Country" }, { header: "Lead time", align: "right" as const }, { header: "Not received", align: "right" as const }],
  sales: [{ header: "Order" }, { header: "Customer", wrap: true }, { header: "Warehouse" }, { header: "Status" }, { header: "Ordered" }, { header: "Weight", align: "right" as const }],
  movements: [
    { header: "Date" },
    { header: "Type" },
    { header: "SKU" },
    { header: "Description", wrap: true },
    { header: "From" },
    { header: "To" },
    { header: "Weight", align: "right" as const },
    { header: "Reference" },
  ],
};

function buildRows(kind: Kind, state: ReturnType<typeof useDemo>["state"]): TableRecord[] {
  if (kind === "warehouses") {
    const weights = state.directory.warehouses.map((warehouse) => state.stock.filter((row) => row.warehouse === warehouse.name).reduce((sum, row) => sum + row.weightKg, 0));
    const shares = formatSharePercents(weights);
    return state.directory.warehouses.map((warehouse, index) => ({
      id: warehouse.id,
      searchText: `${warehouse.name} ${warehouse.country}`,
      cells: [
        textCell(warehouse.name, { mono: true, emphasis: "strong" }),
        textCell(warehouse.name, { emphasis: "strong" }),
        textCell(warehouse.country),
        textCell(formatKg(weights[index] ?? 0), { mono: true }),
        textCell("Not recorded", { mono: true }),
        textCell("Not recorded", { mono: true }),
        textCell(shares[index] ?? "0.0%", { mono: true }),
        statusCell(warehouse.name ? "Active" : "Empty", "neutral"),
      ],
    }));
  }
  if (kind === "customers") {
    return state.directory.companies
      .filter((company) => company.kind === "customer")
      .map((company) => ({
        id: company.id,
        searchText: company.name,
        cells: [
          textCell(company.name, { mono: true, emphasis: "strong" }),
          textCell(company.name, { emphasis: "strong" }),
          textCell("Not recorded"),
          textCell("Not recorded"),
          textCell(String(state.outbound.filter((row) => row.customer.toLowerCase() === company.name.toLowerCase() && row.status !== "Dispatched").length), { mono: true }),
        ],
      }));
  }
  if (kind === "suppliers") {
    return state.directory.companies
      .filter((company) => company.kind === "supplier")
      .map((company) => ({
        id: company.id,
        searchText: company.name,
        cells: [
          textCell(company.name, { mono: true, emphasis: "strong" }),
          textCell(company.name, { emphasis: "strong" }),
          textCell("Not recorded"),
          textCell("Not recorded", { mono: true }),
          textCell(String(state.orders.filter((order) => order.supplier.toLowerCase() === company.name.toLowerCase() && order.status !== "Received" && order.status !== "Rejected").length), { mono: true }),
        ],
      }));
  }
  if (kind === "sales") {
    return state.outbound.map((shipment) => ({
      id: shipment.number,
      searchText: `${shipment.number} ${shipment.customer} ${shipment.warehouse} ${shipment.po}`,
      cells: [
        textCell(shipment.number, { mono: true, emphasis: "strong" }),
        textCell(shipment.customer || "Not recorded", { emphasis: "strong" }),
        textCell(shipment.warehouse),
        statusCell(shipment.status, "neutral"),
        textCell(shipment.date || "Not recorded", { mono: true }),
        textCell(formatKg(shipment.weightKg), { mono: true }),
      ],
    }));
  }
  return state.postedMovements.map((movement) => ({
    id: movement.id,
    searchText: `${movement.reference} ${movement.material} ${movement.from} ${movement.to}`,
    cells: [
      textCell(movement.date, { mono: true }),
      statusCell(movement.kind, "neutral"),
      textCell(movement.material, { mono: true, emphasis: "strong" }),
      textCell(movement.note || movement.material),
      textCell(movement.from),
      textCell(movement.to),
      textCell(formatKg(movement.netKg), { mono: true }),
      textCell(movement.reference, { mono: true }),
    ],
  }));
}
