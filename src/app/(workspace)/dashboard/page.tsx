import type { Metadata } from "next";
import { DashboardBoard } from "@/components/ref/dashboard-board";

export const metadata: Metadata = { title: "Dashboard" };
export const instant = false;

export default function DashboardPage() {
  return <DashboardBoard />;
}
