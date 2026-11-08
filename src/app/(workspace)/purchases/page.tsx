import type { Metadata } from "next";
import { PurchaseList } from "@/components/ref/purchase-list";

export const metadata: Metadata = { title: "Purchase Orders" };

export default function PurchasesPage() {
  return <PurchaseList />;
}
