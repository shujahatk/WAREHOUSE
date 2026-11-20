"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, type FormEvent } from "react";
import { notifyAuthChanged } from "@/components/providers/workspace-provider";
import { signInAction } from "@/domain/actions";
import { cn } from "@/lib/cn";

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
      if (result.role === "offers_user") {
        router.replace("/offers/purchasing");
      } else {
        router.replace("/dashboard");
      }
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
        <div
          role="alert"
          className={cn(
            "rounded-lg p-3 text-sm leading-relaxed border",
            error.toLowerCase().includes("pending") || error.toLowerCase().includes("awaiting")
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : error.toLowerCase().includes("rejected") || error.toLowerCase().includes("declined")
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-red-200 bg-red-50 text-red-900",
          )}
        >
          {error.toLowerCase().includes("pending") || error.toLowerCase().includes("awaiting") ? (
            <div className="flex items-start gap-2.5">
              <svg className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold text-amber-950">Your account is awaiting admin approval.</p>
                <p className="mt-0.5 text-xs text-amber-800">{error}</p>
              </div>
            </div>
          ) : error.toLowerCase().includes("rejected") || error.toLowerCase().includes("declined") ? (
            <div className="flex items-start gap-2.5">
              <svg className="h-5 w-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-red-950">Registration Request Declined</p>
                <p className="mt-0.5 text-xs text-red-800">{error}</p>
              </div>
            </div>
          ) : (
            error
          )}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="flex h-11 min-h-[44px] w-full items-center justify-center rounded-lg bg-neutral-950 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">
        <p>Sign in with your configured warehouse or offers account.</p>
      </div>
      <div className="pt-2 text-center space-y-2">
        <p className="text-sm text-neutral-600">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-neutral-950 underline hover:text-neutral-800">
            Sign up
          </Link>
        </p>
        <p className="text-xs text-neutral-500">
          Trading or Purchasing Partner?{" "}
          <Link href="/register" className="font-medium text-neutral-800 underline hover:text-neutral-950">
            Register for Offers Portal
          </Link>
        </p>
      </div>
    </form>
  );
}
