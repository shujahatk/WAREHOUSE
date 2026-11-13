import type { Metadata } from "next";
import { Suspense } from "react";
import { ShipmentDesk } from "@/components/ref/shipment-desk";

export const metadata: Metadata = { title: { absolute: "Outbound shipment · RM" } };

export default function OutboundDetailPage({ params }: { params: Promise<{ shipment: string }> }) {
  return (
    <Suspense fallback={null}>
      <OutboundShipment params={params} />
    </Suspense>
  );
}

async function OutboundShipment({ params }: { params: Promise<{ shipment: string }> }) {
  const { shipment } = await params;
  return <ShipmentDesk direction="outbound" number={shipment} />;
}
