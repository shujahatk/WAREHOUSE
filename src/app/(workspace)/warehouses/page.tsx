import type { Metadata } from "next";
import { DirectoryBoard } from "@/components/ref/directory-board";
import { WorkspacePage } from "@/components/ui/workspace-page";

export const metadata: Metadata = {
  title: "Warehouses",
};

export default function WarehousesPage() {
  return (
    <WorkspacePage
      title="Warehouses"
      description="Warehouse facilities, on-hand weight, capacity, and distribution across sites."
    >
      <DirectoryBoard kind="warehouses" caption="Warehouses" searchPlaceholder="Search warehouses" minWidthClassName="min-w-[920px]" phoneLayout="cards" />
    </WorkspacePage>
  );
}
