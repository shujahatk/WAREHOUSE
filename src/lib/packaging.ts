export type PackagingDefinition = {
  id: string;
  label: string;
  tareKg: number | null;
  preset: boolean;
};

export const PRESET_PACKAGING: PackagingDefinition[] = [
  { id: "small-pallet", label: "Small Pallet", tareKg: 15, preset: true },
  { id: "normal-pallet", label: "Normal Pallet", tareKg: 25, preset: true },
  { id: "big-pallet", label: "Big Pallet", tareKg: 50, preset: true },
  { id: "carton-box", label: "Carton Box", tareKg: 30, preset: true },
  { id: "wooden-box", label: "Wooden Box", tareKg: 40, preset: true },
  { id: "small-cage", label: "Small Cage", tareKg: 60, preset: true },
  { id: "cage", label: "Cage", tareKg: 120, preset: true },
  { id: "big-cage", label: "Big Cage", tareKg: 160, preset: true },
  { id: "bulk", label: "Bulk / Others", tareKg: null, preset: true },
];

export type SectionMode = "weight" | "count";

export type WeightInput = {
  mode: SectionMode;
  grossKg: number | null;
  tarePerUnitKg: number | null;
  packagingQty: number | null;
  noTare?: boolean;
};

export type WeightResult =
  | { ok: true; totalTareKg: number; netKg: number | null; postsWeight: boolean }
  | { ok: false; error: string };

export function calculateSection(input: WeightInput): WeightResult {
  if (input.mode === "count") {
    return { ok: true, totalTareKg: 0, netKg: null, postsWeight: false };
  }
  if (input.grossKg == null || !Number.isFinite(input.grossKg) || input.grossKg < 0) {
    return { ok: false, error: "Gross weight must be zero or greater, in kilograms." };
  }
  if (input.packagingQty == null || !Number.isInteger(input.packagingQty) || input.packagingQty < 0) {
    return { ok: false, error: "Packaging quantity must be a whole number, zero or greater." };
  }
  const tarePerUnitKg = input.noTare ? 0 : input.tarePerUnitKg;
  if (tarePerUnitKg == null || !Number.isFinite(tarePerUnitKg) || tarePerUnitKg < 0) {
    return { ok: false, error: "Enter a tare per unit in kilograms, or choose no tare for Bulk / Others." };
  }
  const totalTareKg = tarePerUnitKg * input.packagingQty;
  if (totalTareKg > input.grossKg) {
    return { ok: false, error: "Total packaging tare cannot exceed gross weight." };
  }
  return { ok: true, totalTareKg, netKg: input.grossKg - totalTareKg, postsWeight: true };
}

export function tareForPackaging(definitions: PackagingDefinition[], packagingId: string): number | null | undefined {
  return definitions.find((item) => item.id === packagingId)?.tareKg;
}

const CMR_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function validateShipmentFile(kind: "cmr" | "photo" | "annex", file: { name: string; type: string; size: number }): string | null {
  if (!file.name.trim() || file.size <= 0) return "Choose a non-empty file before attaching it.";
  const allowed = kind === "photo" ? PHOTO_TYPES : CMR_TYPES;
  if (!allowed.has(file.type)) {
    if (kind === "annex") return "An Annex 7 file must be a PDF or an image. Other types are not accepted.";
    return kind === "cmr"
      ? "A CMR must be a PDF or an image. Other types are not accepted, and nothing is extracted from the file."
      : "A shipment photo must be an image.";
  }
  return null;
}

export function previewKind(mime: string): "image" | "pdf" | "none" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  return "none";
}
