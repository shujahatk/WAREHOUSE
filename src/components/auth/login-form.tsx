"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, type FormEvent } from "react";
import { notifyAuthChanged } from "@/components/providers/workspace-provider";
import { signInAction } from "@/domain/actions";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useLayoutEffect(() => {
    return () => {
      setPending(false);
      setError(null);
      setPassword("");
      setShowPassword(false);
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Enter an email and password.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await signInAction(trimmedEmail, password);
      if (result.error) {
        setPending(false);
        setError(result.error);
        return;
      }
      setPending(false);
      setPassword("");
      setShowPassword(false);
      notifyAuthChanged();
      try {
        const bc = new BroadcastChannel("stockflow-sync");
        bc.postMessage({ type: "auth_changed" });
        bc.close();
      } catch {}
      router.replace("/dashboard");
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
    }
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate>
      <label className="block text-sm font-medium text-neutral-700">
        Email address
        <input
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
        />
      </label>
      <label className="block text-sm font-medium text-neutral-700">
        Password
        <span className="relative mt-1 block">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-lg border border-neutral-300 px-3 pr-16 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-1 px-2 text-xs font-medium text-neutral-700"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </span>
      </label>
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="flex h-11 min-h-[44px] w-full items-center justify-center rounded-lg bg-neutral-950 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">
        <p>Sign in with the account configured for this warehouse.</p>
      </div>
    </form>
  );
}
