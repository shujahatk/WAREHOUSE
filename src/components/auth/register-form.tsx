"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { registerOffersUserAction } from "@/domain/actions";

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedNotice, setSubmittedNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Please enter a valid work email address.");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setPending(true);
    setError(null);

    const result = await registerOffersUserAction({
      name: trimmedName,
      email: trimmedEmail,
      company: company.trim() || undefined,
      password,
      notes: notes.trim() || undefined,
    });

    setPending(false);
    if (result.error) {
      const raw = result.error.toLowerCase();
      if (
        raw.includes("rpc_register") ||
        raw.includes("schema cache") ||
        raw.includes("foreign key") ||
        raw.includes("users_auth_user_id_fkey") ||
        raw.includes("already registered") ||
        raw.includes("duplicate key") ||
        raw.includes("unique") ||
        raw.includes("violates") ||
        raw.includes("23503") ||
        raw.includes("23505")
      ) {
        setError("This email address is already registered or associated with an account. Please sign in with your email and password.");
      } else {
        setError(result.error);
      }
    } else {
      if (result.notice) {
        setSubmittedNotice(result.notice);
      }
      setSubmitted(true);
    }
  }

  if (submitted) {
    const isAlreadyApproved = submittedNotice?.includes("already approved") || submittedNotice?.includes("ready");
    return (
      <div className="mt-8 space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-neutral-900">
          {isAlreadyApproved ? "Account Ready" : "Registration Submitted"}
        </h3>
        <p className="text-sm text-neutral-600 leading-relaxed">
          {submittedNotice ? (
            submittedNotice
          ) : (
            <>
              Thank you, <span className="font-medium text-neutral-900">{name}</span>. Your account request has been registered and is now <strong>Pending Administrator Approval</strong>.
            </>
          )}
        </p>
        <p className="text-xs text-neutral-500">
          {isAlreadyApproved
            ? "Your Offers User credentials are valid. You can sign in immediately to access the portal."
            : "An administrator has been notified. Once approved, you will receive full access to the RM Offers Portal with your email and password."}
        </p>
        <div className="pt-4">
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            {isAlreadyApproved ? "Sign in to Offers Portal" : "Return to Sign in"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={(e) => void onSubmit(e)} noValidate>
      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Full name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jane Doe"
            className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Company / Organization
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Acme Trading Ltd"
            className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Work email address
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Business notes / Procurement interests (optional)
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tell us what materials or quantities you trade..."
            className="mt-1 w-full rounded-lg border border-neutral-300 p-3 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          />
        </label>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>{error}</p>
          {error.includes("already registered") || error.includes("sign in") ? (
            <p className="mt-1 font-medium">
              <Link href="/login" className="underline hover:text-red-950">
                Click here to sign in with your email and password &rarr;
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 min-h-[44px] w-full items-center justify-center rounded-lg bg-neutral-950 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Submitting Request…" : "Register for Offers Portal"}
      </button>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">
        <p>
          Offers User accounts require administrator approval before portal access is granted.
        </p>
      </div>

      <div className="text-center pt-2">
        <p className="text-sm text-neutral-600">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-neutral-950 underline hover:text-neutral-800">
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
}

