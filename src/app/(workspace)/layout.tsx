import { Suspense, type ReactNode } from "react";
import { DemoProvider } from "@/components/providers/workspace-provider";
import { AppShell } from "@/components/shell/app-shell";
import { AuthGate } from "@/components/shell/auth-gate";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <DemoProvider>
      <AuthGate>
        <Suspense fallback={<p className="px-6 py-10 text-sm text-neutral-600">Loading workspace…</p>}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </AuthGate>
    </DemoProvider>
  );
}
