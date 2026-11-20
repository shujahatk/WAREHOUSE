import type { Metadata } from "next";
import { PendingVerificationView } from "@/components/verification/pending-verification-view";

export const metadata: Metadata = { title: "Pending Verification" };

export default function VerificationPage() {
  return <PendingVerificationView />;
}
