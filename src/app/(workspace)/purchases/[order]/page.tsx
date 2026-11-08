import type { Metadata } from "next";
import { Suspense } from "react";
import { PurchaseDetail } from "@/components/ref/purchase-detail";

export const metadata: Metadata = { title: { absolute: "Purchase order · StockFlow" } };

export default function PurchaseDetailPage({ params }: { params: Promise<{ order: string }> }) {
  return (
    <Suspense fallback={null}>
      <PurchaseOrder params={params} />
    </Suspense>
  );
}

async function PurchaseOrder({ params }: { params: Promise<{ order: string }> }) {
  const { order } = await params;
  return <PurchaseDetail key={order} number={order} />;
}
