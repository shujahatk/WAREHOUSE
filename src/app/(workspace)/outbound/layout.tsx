import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Outbound" };

export default function OutboundLayout({ children }: { children: ReactNode }) {
  return children;
}
