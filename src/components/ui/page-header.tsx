import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  notice?: ReactNode;
};

export function PageHeader({ title, description, notice }: PageHeaderProps) {
  return (
    <header className="mb-6 border-b border-neutral-200 pb-5">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">{description}</p>
      {notice ? <div className="mt-4">{notice}</div> : null}
    </header>
  );
}

type SectionHeaderProps = {
  title: string;
  description?: string;
};

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold tracking-tight text-neutral-950">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-600">{description}</p>
      ) : null}
    </div>
  );
}
