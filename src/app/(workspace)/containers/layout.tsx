import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Inbound" };

export default function ContainersLayout({ children }: { children: ReactNode }) {
  return children;
}
