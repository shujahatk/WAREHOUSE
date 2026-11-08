type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-neutral-950">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-neutral-600">{description}</p>
    </div>
  );
}
