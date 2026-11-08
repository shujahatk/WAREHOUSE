import type { Metadata } from "next";
import { PostedMovements } from "@/components/stock/posted-movements";
import { DirectoryBoard } from "@/components/ref/directory-board";
import { WorkspacePage } from "@/components/ui/workspace-page";

export const metadata: Metadata = {
  title: "Stock movements",
};

export default function StockMovementsPage() {
  return (
    <WorkspacePage
      title="Stock movements"
      description="Append-only log of posted stock movements and warehouse inventory transactions."
    >
      <PostedMovements />
      <DirectoryBoard kind="movements" caption="Stock movements" searchPlaceholder="Search stock movements" minWidthClassName="min-w-[1080px]" phoneLayout="cards" />
    </WorkspacePage>
  );
}
