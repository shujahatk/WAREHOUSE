import type { Metadata } from "next";
import Image from "next/image";
import { SignUpForm } from "@/components/auth/signup-form";
import { Mark } from "@/components/shell/sidebar";

export const metadata: Metadata = {
  title: { absolute: "Create an Account · RM" },
  description: "Request an account for RM Logistics and Trading.",
};

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-2">
      <section className="relative flex min-h-[280px] flex-col justify-between overflow-hidden bg-neutral-950 px-8 py-10 text-white lg:min-h-screen lg:px-12">
        <Image
          src="/images/warehouse.jpg"
          alt="Warehouse aisle with pallet racking and operations"
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-neutral-950/60" />
        <div className="relative">
          <Mark light />
        </div>
        <div className="relative">
          <p className="text-3xl font-semibold tracking-tight">Access Request</p>
          <p className="mt-1 text-2xl font-normal tracking-tight text-neutral-300">
            Enterprise Warehouse &amp; Trading Platform
          </p>
        </div>
        <p className="relative text-xs text-neutral-400">Secure enterprise supply chain system. Powered by RM.</p>
      </section>
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12 overflow-y-auto">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Create an Account</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign up for access to RM</p>
          <SignUpForm />
        </div>
      </section>
    </main>
  );
}

