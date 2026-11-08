export type StatusTone = "neutral" | "solid" | "quiet" | "attention";

export type TableColumn = {
  header: string;
  align?: "left" | "right";
  wrap?: boolean;
};

export type TableCell =
  | {
      kind: "text";
      value: string;
      emphasis?: "default" | "muted" | "strong";
      mono?: boolean;
    }
  | {
      kind: "status";
      label: string;
      tone: StatusTone;
    };

export type RecordField = {
  label: string;
  value: string;
  mono?: boolean;
};

export type RecordCard = {
  title: string;
  subtitle?: string;
  summary?: string;
  status?: {
    label: string;
    tone: StatusTone;
  };
  fields: RecordField[];
};

export type TableRecord = {
  id: string;
  searchText: string;
  cells: TableCell[];
  card?: RecordCard;
};

export type TableModel = {
  columns: TableColumn[];
  rows: TableRecord[];
};

export function textCell(
  value: string,
  options?: { emphasis?: "default" | "muted" | "strong"; mono?: boolean },
): TableCell {
  return {
    kind: "text",
    value,
    emphasis: options?.emphasis,
    mono: options?.mono,
  };
}

export function statusCell(label: string, tone: StatusTone): TableCell {
  return { kind: "status", label, tone };
}
