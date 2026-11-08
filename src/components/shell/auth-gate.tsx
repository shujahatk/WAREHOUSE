"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import type { DemoIdentity } from "@/domain/view";

type SessionValue = {
  identity: DemoIdentity;
  logout: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside AuthGate");
  return value;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { actor, ready, signOut } = useDemo();

  useEffect(() => {
    if (ready && !actor) router.replace("/login");
  }, [actor, ready, router]);

  if (!ready || !actor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f4f5] text-sm text-neutral-500">
        Loading workspace…
      </div>
    );
  }

  const identity: DemoIdentity = {
    email: actor.email,
    name: actor.name,
    role: actor.role,
    warehouse: actor.warehouse,
    company: actor.company ?? null,
    status: "Active",
  };

  function logout() {
    void signOut().then(() => router.replace("/login"));
  }

  return <SessionContext.Provider value={{ identity, logout }}>{children}</SessionContext.Provider>;
}
