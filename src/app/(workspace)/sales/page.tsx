import Link from "next/link";
import { Surface } from "@/components/ref/chrome";

export default function SalesPage() {
  return (
    <Surface className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold text-neutral-950">Sales & Purchasing Offers postponed</h1>
      <p className="mt-2 text-sm leading-6 text-neutral-600">
        The Sales & Purchasing Offers module is postponed for a future phase. Operational Sales Orders (SO) for loading operations are managed under PO & SO Orders and Outgoing / Loading.
      </p>
      <div className="mt-4 flex flex-wrap gap-4">
        <Link href="/purchases" className="text-sm font-medium text-neutral-950 underline underline-offset-4">
          Open PO & SO Orders
        </Link>
        <Link href="/outbound" className="text-sm font-medium text-neutral-950 underline underline-offset-4">
          Open Outgoing / Loading
        </Link>
      </div>
    </Surface>
  );
}
