import Link from "next/link";
import { Surface } from "@/components/ref/chrome";

export default function ChatPage() {
  return (
    <Surface className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold text-neutral-950">Module unavailable</h1>
      <p className="mt-2 text-sm leading-6 text-neutral-600">
        The legacy browser chat module has been removed from RM.
      </p>
      <Link href="/dashboard" className="mt-4 inline-flex text-sm font-medium text-neutral-950 underline underline-offset-4">
        Return to Dashboard
      </Link>
    </Surface>
  );
}
