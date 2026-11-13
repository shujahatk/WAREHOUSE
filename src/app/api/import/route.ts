import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getDataAdapter } from "@/lib/data/local-adapter";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const jar = await cookies();
    const sessionId = jar.get("stockflow_session")?.value;
    if (!sessionId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const adapter = getDataAdapter();
    const currentUser = await adapter.current(sessionId);
    if (!currentUser || !currentUser.active) {
      return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });
    }

    // Role check: Only Admin (owner) and Staff (manager) can import data
    if (currentUser.role !== "owner" && currentUser.role !== "manager") {
      return NextResponse.json({ error: "Forbidden: Only Admin and Staff can import data." }, { status: 403 });
    }

    const body = await request.json();
    const entity = String(body.entity || "").trim().toLowerCase();
    const rawRows = Array.isArray(body.rows) ? body.rows : [];

    if (!rawRows.length) {
      return NextResponse.json({ error: "No data rows provided for import." }, { status: 400 });
    }

    const snapshot = await adapter.snapshot(sessionId);
    const warnings: string[] = [];
    let importedCount = 0;

    switch (entity) {
      case "materials": {
        const existingNumbers = new Set(snapshot.materials.map((m) => m.materialNumber.trim().toLowerCase()));
        const toInsert: Array<{ id: string; materialNumber: string; description: string; unit: string; lowStockThresholdKg: number }> = [];

        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i];
          const matNum = String(row.materialNumber || row["Material Number"] || row.code || "").trim();
          const desc = String(row.description || row["Description"] || row.name || "").trim();
          const thresh = Math.max(0, Number(row.lowStockThresholdKg || row["Low Stock Threshold"] || row.threshold || 0));

          if (!matNum || !desc) {
            warnings.push(`Row ${i + 1}: Skipped (missing material number or description).`);
            continue;
          }

          if (existingNumbers.has(matNum.toLowerCase())) {
            warnings.push(`Row ${i + 1}: Material "${matNum}" already exists. Skipped duplicate.`);
            continue;
          }

          existingNumbers.add(matNum.toLowerCase());
          toInsert.push({
            id: randomUUID(),
            materialNumber: matNum,
            description: desc,
            unit: "kg",
            lowStockThresholdKg: thresh,
          });
        }

        if (toInsert.length > 0) {
          // If in supabase mode, insert into supabase
          if (process.env.STOCKFLOW_DATA_ADAPTER === "supabase") {
            const supabaseAdapter = adapter as unknown as {
              client?: { insert: (table: string, values: unknown[], token?: string | null) => Promise<unknown> };
              resolveToken?: (id: string | null) => string | null;
            };
            if (supabaseAdapter.client) {
              const token = supabaseAdapter.resolveToken ? supabaseAdapter.resolveToken(sessionId) : sessionId;
              const mapped = toInsert.map((item) => ({
                id: item.id,
                material_number: item.materialNumber,
                description: item.description,
                unit: item.unit,
                low_stock_threshold_kg: item.lowStockThresholdKg,
              }));
              await supabaseAdapter.client.insert("materials", mapped, token);
            }
          } else {
            // Local mode
            for (const item of toInsert) {
              snapshot.materials.push(item);
            }
          }
          importedCount = toInsert.length;
        }
        break;
      }

      case "suppliers":
      case "customers": {
        const kind = entity === "suppliers" ? "supplier" : "customer";
        const existingNames = new Set(
          snapshot.companies.filter((c) => c.kind === kind).map((c) => c.name.trim().toLowerCase()),
        );
        const toInsert: Array<{ id: string; name: string; kind: "supplier" | "customer"; active: boolean }> = [];

        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i];
          const name = String(row.name || row["Supplier Name"] || row["Customer Name"] || row.company || "").trim();

          if (!name) {
            warnings.push(`Row ${i + 1}: Skipped (missing company name).`);
            continue;
          }

          if (existingNames.has(name.toLowerCase())) {
            warnings.push(`Row ${i + 1}: Company "${name}" already exists. Skipped duplicate.`);
            continue;
          }

          existingNames.add(name.toLowerCase());
          toInsert.push({
            id: randomUUID(),
            name,
            kind,
            active: true,
          });
        }

        if (toInsert.length > 0) {
          if (process.env.STOCKFLOW_DATA_ADAPTER === "supabase") {
            const supabaseAdapter = adapter as unknown as {
              client?: { insert: (table: string, values: unknown[], token?: string | null) => Promise<unknown> };
              resolveToken?: (id: string | null) => string | null;
            };
            if (supabaseAdapter.client) {
              const token = supabaseAdapter.resolveToken ? supabaseAdapter.resolveToken(sessionId) : sessionId;
              await supabaseAdapter.client.insert("companies", toInsert, token);
            }
          } else {
            for (const item of toInsert) {
              snapshot.companies.push(item);
            }
          }
          importedCount = toInsert.length;
        }
        break;
      }

      default:
        return NextResponse.json({ error: `Unsupported import entity: ${entity}` }, { status: 400 });
    }

    logger.info("Batch CSV import completed", {
      user: currentUser.email,
      entity,
      importedCount,
      warningsCount: warnings.length,
    });

    return NextResponse.json({
      success: true,
      importedCount,
      warnings,
      message: `Successfully imported ${importedCount} ${entity} records.`,
    });
  } catch (error) {
    logger.error("Batch import error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to execute batch import." },
      { status: 500 },
    );
  }
}
