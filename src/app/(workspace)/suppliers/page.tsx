import type { Metadata } from "next";
import { DirectoryBoard } from "@/components/ref/directory-board";
import { WorkspacePage } from "@/components/ui/workspace-page";

export const metadata: Metadata = {
  title: "Suppliers",
};

export default function SuppliersPage() {
  return (
    <WorkspacePage
      title="Suppliers"
      description="Supplier directory. Not received counts draft and pending purchase orders. Received orders are excluded."
    >
      <DirectoryBoard kind="suppliers" caption="Suppliers" searchPlaceholder="Search suppliers" minWidthClassName="min-w-[720px]" />
    </WorkspacePage>
  );
}
