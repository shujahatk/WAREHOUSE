import { randomBytes } from "node:crypto";
import { hashPassword } from "./passwords.ts";
import { fail, ok, type Result } from "./result.ts";
import { issues, referenceSeedSchema, userRecordSchema, type StoreData } from "./schemas.ts";

export function seedStore(store: StoreData, env: NodeJS.ProcessEnv, now: string, id: () => string): Result<void> {
  const email = env.STOCKFLOW_OWNER_EMAIL?.trim() ?? "";
  const name = env.STOCKFLOW_OWNER_NAME?.trim() ?? "";
  const password = env.STOCKFLOW_OWNER_PASSWORD ?? "";
  if (store.users.length === 0 && (email || name || password) && (!email || !name || !password)) {
    return fail("Set STOCKFLOW_OWNER_EMAIL, STOCKFLOW_OWNER_NAME, and STOCKFLOW_OWNER_PASSWORD together. No owner account was invented.");
  }
  if (!store.fileSecret) store.fileSecret = randomBytes(32).toString("hex");
  if (store.warehouses.length === 0) {
    upsertWarehouse(store, "Bornem", "Belgium", id);
    upsertWarehouse(store, "Turnhout", "Belgium", id);
    upsertWarehouse(store, "Spain", "Spain", id);
    upsertWarehouse(store, "Pakistan", "Pakistan", id);
  }
  if (store.packagingTypes.length === 0) {
    const defaults = [
      { name: "Small Pallet", tareKg: 15 },
      { name: "Normal Pallet", tareKg: 25 },
      { name: "Big Pallet", tareKg: 50 },
      { name: "Carton Box", tareKg: 30 },
      { name: "Wooden Box", tareKg: 40 },
      { name: "Small Cage", tareKg: 60 },
      { name: "Cage", tareKg: 120 },
      { name: "Big Cage", tareKg: 160 },
      { name: "Bulk / Others", tareKg: 0 },
    ];
    for (const item of defaults) {
      store.packagingTypes.push({ id: id(), name: item.name, tareKg: item.tareKg, active: true });
    }
  }
  const referenceText = env.STOCKFLOW_REFERENCE_JSON?.trim();
  if (referenceText) {
    let json: unknown;
    try {
      json = JSON.parse(referenceText);
    } catch {
      return fail("STOCKFLOW_REFERENCE_JSON is not valid JSON.");
    }
    const parsed = referenceSeedSchema.safeParse(json);
    if (!parsed.success) return fail(`STOCKFLOW_REFERENCE_JSON does not match the reference schema. ${issues(parsed.error)}`);
    for (const warehouse of parsed.data.warehouses) upsertWarehouse(store, warehouse.name, warehouse.country, id);
    for (const company of parsed.data.companies) upsertCompany(store, company.name, company.kind, id);
    for (const material of parsed.data.materials) {
      const existing = store.materials.find((item) => item.materialNumber.toLowerCase() === material.materialNumber.toLowerCase());
      if (existing) {
        existing.description = material.description;
        existing.unit = material.unit;
        existing.lowStockThresholdKg = material.lowStockThresholdKg;
      } else {
        store.materials.push({ id: id(), ...material });
      }
    }
    for (const packaging of parsed.data.packagingTypes) {
      const existing = store.packagingTypes.find((item) => item.name.toLowerCase() === packaging.name.toLowerCase());
      if (existing) existing.tareKg = packaging.tareKg;
      else store.packagingTypes.push({ id: id(), name: packaging.name, tareKg: packaging.tareKg, active: true });
    }
  }
  if (store.users.length > 0 || !email || !name || !password) return ok(undefined);
  const user = userRecordSchema.safeParse({
    id: id(),
    email,
    name,
    role: "owner",
    warehouseId: null,
    companyId: null,
    active: true,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
  });
  if (!user.success) return fail(`The owner account from the environment is invalid. ${issues(user.error)}`);
  store.users.push(user.data);
  return ok(undefined);
}

export function upsertWarehouse(store: StoreData, name: string, country: string, id: () => string) {
  const found = store.warehouses.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  const created = { id: id(), name, country: country || "Not recorded", active: true };
  store.warehouses.push(created);
  return created;
}

export function upsertCompany(store: StoreData, name: string, kind: "supplier" | "customer", id: () => string) {
  const found = store.companies.find((item) => item.name.toLowerCase() === name.toLowerCase() && item.kind === kind);
  if (found) return found;
  const created = { id: id(), name, kind, active: true };
  store.companies.push(created);
  return created;
}
