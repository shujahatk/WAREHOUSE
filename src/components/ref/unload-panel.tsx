"use client";

import { ShipmentDesk } from "@/components/ref/shipment-desk";

export function UnloadScreen({ number }: { number: string }) {
  return <ShipmentDesk direction="inbound" number={number} />;
}
