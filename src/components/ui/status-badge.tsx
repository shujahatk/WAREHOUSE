import { cn } from "@/lib/cn";
import type { StatusTone } from "@/lib/table";

const tones: Record<StatusTone, string> = {
  neutral: "border border-neutral-300 bg-white text-neutral-700",
  quiet: "bg-neutral-100 text-neutral-700",
  attention: "border border-neutral-950 bg-white text-neutral-950",
  solid: "bg-neutral-950 text-white",
};

type StatusBadgeProps = {
  label: string;
  tone: StatusTone;
};

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap",
        tones[tone],
      )}
    >
      {label}
    </span>
  );
}
