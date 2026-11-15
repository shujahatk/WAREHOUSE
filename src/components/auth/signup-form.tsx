"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { signUpAction } from "@/domain/actions";

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setError("Please enter your full name.");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!trimmedPhone || trimmedPhone.length < 6) {
      setError("Please enter a valid phone number.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Password must include at least one letter and one number.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setPending(true);
    setError(null);

    const result = await signUpAction({
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      password,
      confirmPassword,
      notes: notes.trim() || undefined,
    });

    setPending(false);
    if (result.error) {
      const raw = result.error;
      if (
        raw.includes("rpc_register") ||
        raw.includes("schema cache") ||
        raw.includes("foreign key") ||
        raw.includes("users_auth_user_id_fkey") ||
        raw.includes("already registered")
      ) {
        setError("This email address is already registered in the system. Please sign in with your email and password.");
      } else {
        setError(result.error);
      }
    } else {
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="mt-8 space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-neutral-900">Registration Request Submitted</h3>
        <p className="text-sm text-neutral-600 leading-relaxed">
          Thank you, <span className="font-semibold text-neutral-900">{name}</span>. Your registration request has been submitted and is currently <strong>Pending Administrator Approval</strong>.
        </p>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 leading-relaxed text-left">
          <p className="font-medium">Important Security Notice:</p>
          <p className="mt-0.5">
            Signing up does not automatically grant access to warehouse operations or data. An administrator has been notified and will review your application. Once approved, you will be able to log in.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white hover:bg-neutral-800 transition"
          >
            Return to Sign in
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
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jane Doe"
            className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Email address
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Phone number
          <input
            type="tel"
            required
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +32 470 12 34 56"
            className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Password
          <div className="relative mt-1">
            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters (letters & numbers)"
              className="h-11 w-full rounded-lg border border-neutral-300 px-3 pr-16 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-1 px-2 text-xs font-medium text-neutral-700 hover:text-neutral-950"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Confirm password
          <input
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Application notes / Department (optional)
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Briefly state your role or warehouse location..."
            className="mt-1 w-full rounded-lg border border-neutral-300 p-3 text-base sm:text-sm text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          />
        </label>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 leading-snug">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 min-h-[44px] w-full items-center justify-center rounded-lg bg-neutral-950 text-sm font-semibold text-white shadow-xs hover:bg-neutral-800 disabled:opacity-60 transition"
      >
        {pending ? "Submitting application…" : "Submit Registration Request"}
      </button>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
        <p>
          Submitted accounts require administrator verification and role assignment before warehouse or system access is activated.
        </p>
      </div>

      <div className="pt-2 text-center">
        <p className="text-sm text-neutral-600">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-neutral-950 underline hover:text-neutral-800">
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
}

