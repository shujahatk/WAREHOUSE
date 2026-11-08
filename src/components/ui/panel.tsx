import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
  fill?: boolean;
};

export function Panel({ title, description, aside, children, fill = false }: PanelProps) {
  return (
    <section
      className={
        fill
          ? "flex h-full flex-col rounded-xl border border-neutral-200 bg-white"
          : "rounded-xl border border-neutral-200 bg-white"
      }
    >
      <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-neutral-950">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-600">{description}</p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className={fill ? "flex-1 p-4" : "p-4"}>{children}</div>
    </section>
  );
}
