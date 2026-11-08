type DefinitionItem = {
  term: string;
  detail: string;
};

type DefinitionListProps = {
  items: DefinitionItem[];
};

export function DefinitionList({ items }: DefinitionListProps) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.term}>
          <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
            {item.term}
          </dt>
          <dd className="mt-1 text-sm text-neutral-950">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
