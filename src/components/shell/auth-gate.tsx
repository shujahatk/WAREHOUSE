"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import type { DemoIdentity } from "@/domain/view";

type SessionValue = {
  identity: DemoIdentity;
  ready: boolean;
  logout: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside AuthGate");
  return value;
}

const fallbackIdentity: DemoIdentity = {
  email: "",
  name: "User",
  role: "worker",
  warehouse: null,
  company: null,
  status: "Active",
};

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { actor, ready, signOut } = useDemo();

  useEffect(() => {
    if (ready && !actor) router.replace("/login");
  }, [actor, ready, router]);

  const identity: DemoIdentity = useMemo(() => {
    if (!actor) return fallbackIdentity;
    return {
      email: actor.email,
      name: actor.name,
      role: actor.role,
      warehouse: actor.warehouse,
      company: actor.company ?? null,
      status: "Active",
    };
  }, [actor]);

  const value = useMemo<SessionValue>(
    () => ({
      identity,
      ready,
      logout: () => {
        void signOut().then(() => router.replace("/login"));
      },
    }),
    [identity, ready, router, signOut],
  );

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-neutral-600">Loading workspace…</p>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={value}>
      <div key={actor?.email || "anon"} className="contents">
        {children}
      </div>
    </SessionContext.Provider>
  );
}
