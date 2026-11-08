import type { Metadata } from "next";
import { DirectoryBoard } from "@/components/ref/directory-board";
import { WorkspacePage } from "@/components/ui/workspace-page";

export const metadata: Metadata = {
  title: "Customers",
};

export default function CustomersPage() {
  return (
    <WorkspacePage
      title="Customers"
      description="Customer directory. Open sales counts orders with status Open and leaves drafts out of that count."
    >
      <DirectoryBoard kind="customers" caption="Customers" searchPlaceholder="Search customers" minWidthClassName="min-w-[640px]" />
    </WorkspacePage>
  );
}
