import type { Metadata } from "next";
import { ReportsBoard } from "@/components/ref/reports-board";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return <ReportsBoard />;
}
