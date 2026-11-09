import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { LocalAdapter, getDataAdapter } from "./local-adapter.ts";
import { SupabaseAdapter, createSupabaseAdapter } from "./supabase-adapter.ts";
import { getDataAdapterMode } from "../supabase/config.ts";
import type { FetchLike } from "../supabase/client.ts";

const ADMIN_ID = "00000000-0000-4000-a000-000000000001";
const STAFF_ID = "00000000-0000-4000-a000-000000000002";
const WORKER_BORNEM_ID = "00000000-0000-4000-a000-000000000003";
const WORKER_TURNHOUT_ID = "00000000-0000-4000-a000-000000000004";

const WH_BORNEM_ID = "10000000-0000-4000-a000-000000000001";
const WH_TURNHOUT_ID = "10000000-0000-4000-a000-000000000002";
const WH_SPAIN_ID = "10000000-0000-4000-a000-000000000003";
const WH_PAKISTAN_ID = "10000000-0000-4000-a000-000000000004";

const TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  STOCKFLOW_DATA_ADAPTER: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SUPABASE_STORAGE_BUCKET: "stockflow-files",
};

function createMockSupabaseFetch() {
  const calls: { url: string; method: string; authHeader: string | null; body: unknown }[] = [];

  const users: Record<string, Record<string, unknown>> = {
    [ADMIN_ID]: {
      id: ADMIN_ID,
      auth_user_id: ADMIN_ID,
      email: "admin@stockflow.test",
      name: "Admin Owner",
      role: "owner",
      warehouse_id: null,
      company_id: null,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    [STAFF_ID]: {
      id: STAFF_ID,
      auth_user_id: STAFF_ID,
      email: "staff@stockflow.test",
      name: "Staff Manager",
      role: "manager",
      warehouse_id: null,
      company_id: null,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    [WORKER_BORNEM_ID]: {
      id: WORKER_BORNEM_ID,
      auth_user_id: WORKER_BORNEM_ID,
      email: "worker.bornem@stockflow.test",
      name: "Bornem Worker",
      role: "worker",
      warehouse_id: WH_BORNEM_ID,
      company_id: null,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    [WORKER_TURNHOUT_ID]: {
      id: WORKER_TURNHOUT_ID,
      auth_user_id: WORKER_TURNHOUT_ID,
      email: "worker.turnhout@stockflow.test",
      name: "Turnhout Worker",
      role: "worker",
      warehouse_id: WH_TURNHOUT_ID,
      company_id: null,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  };

  const tokenToUser: Record<string, Record<string, unknown>> = {
    "jwt-admin": users[ADMIN_ID],
    "jwt-staff": users[STAFF_ID],
    "jwt-worker-bornem": users[WORKER_BORNEM_ID],
    "jwt-worker-turnhout": users[WORKER_TURNHOUT_ID],
  };

  const purchaseOrders: Record<string, unknown>[] = [
    {
      id: "20000000-0000-4000-a000-000000000001",
      number: "PO-100",
      company_id: "30000000-0000-4000-a000-000000000001",
      status: "submitted",
      value_eur: 12000,
      notes: "",
      created_by: STAFF_ID,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "20000000-0000-4000-a000-000000000002",
      number: "PO-APPROVED",
      company_id: "30000000-0000-4000-a000-000000000001",
      status: "approved",
      value_eur: 18000,
      notes: "",
      created_by: STAFF_ID,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];

  const shipments: Record<string, unknown>[] = [
    {
      id: "40000000-0000-4000-a000-000000000001",
      reference: "IN-BOR-01",
      direction: "inbound",
      purchase_order_id: "20000000-0000-4000-a000-000000000002",
      container_number: "MSCU1234567",
      warehouse_id: WH_BORNEM_ID,
      origin_country: "Belgium",
      destination_country: "Belgium",
      status: "Arrived",
      carrier_name: "DHL",
      handed_over_at: null,
      annex7_required: true,
      seller_status: "Pending",
      seller_company: "Nordic Metals",
      seller_confirmed_by: "",
      seller_confirmed_at: "",
      override_reason: null,
      override_by: null,
      override_at: null,
    },
  ];

  const requests: Record<string, unknown>[] = [
    {
      id: "50000000-0000-4000-a000-000000000001",
      number: "REQ-2026-0001",
      type: "unloading",
      shipment_id: "40000000-0000-4000-a000-000000000001",
      purchase_order_id: "20000000-0000-4000-a000-000000000002",
      container_number: "MSCU1234567",
      warehouse_id: WH_BORNEM_ID,
      created_by: WORKER_BORNEM_ID,
      status: "submitted",
      decline_reason: null,
      sent_back_note: null,
      approved_by: null,
      approved_at: null,
      entered_by: null,
      entered_at: null,
      deleted_by: null,
      deleted_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ];

  const documents: Record<string, unknown>[] = [];

  const fetchImpl: FetchLike = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const headersObj = (init?.headers ?? {}) as Record<string, string>;
    const authHeader = headersObj.Authorization ?? null;
    const token = authHeader?.replace(/^Bearer\s+/i, "") ?? "";

    let parsedBody: unknown = null;
    if (typeof init?.body === "string") {
      try {
        parsedBody = JSON.parse(init.body);
      } catch {
        parsedBody = init.body;
      }
    }
    calls.push({ url, method, authHeader, body: parsedBody });

    const jsonResponse = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    if (url.includes("/auth/v1/token?grant_type=password")) {
      const body = parsedBody as { email: string };
      if (body.email === "admin@stockflow.test") {
        return jsonResponse({
          access_token: "jwt-admin",
          refresh_token: "ref-admin",
          expires_in: 3600,
          user: { id: ADMIN_ID, email: body.email },
        });
      }
      if (body.email === "staff@stockflow.test") {
        return jsonResponse({
          access_token: "jwt-staff",
          refresh_token: "ref-staff",
          expires_in: 3600,
          user: { id: STAFF_ID, email: body.email },
        });
      }
      if (body.email === "worker.bornem@stockflow.test") {
        return jsonResponse({
          access_token: "jwt-worker-bornem",
          refresh_token: "ref-worker-bornem",
          expires_in: 3600,
          user: { id: WORKER_BORNEM_ID, email: body.email },
        });
      }
      if (body.email === "worker.turnhout@stockflow.test") {
        return jsonResponse({
          access_token: "jwt-worker-turnhout",
          refresh_token: "ref-worker-turnhout",
          expires_in: 3600,
          user: { id: WORKER_TURNHOUT_ID, email: body.email },
        });
      }
      return jsonResponse({ error_description: "Invalid login credentials" }, 400);
    }

    if (url.includes("/auth/v1/logout")) {
      return jsonResponse({}, 200);
    }

    if (url.includes("/rest/v1/rpc/current_app_user")) {
      const user = tokenToUser[token];
      return jsonResponse(user ?? null, 200);
    }

    if (url.includes("/rest/v1/rpc/rpc_admin_decide_order")) {
      const body = parsedBody as { p_order_number: string; p_decision: string };
      const po = purchaseOrders.find((p) => p.number === body.p_order_number);
      if (!po) return jsonResponse({ message: "That purchase order does not exist." }, 400);
      po.status = body.p_decision;
      return jsonResponse(po, 200);
    }

    if (url.includes("/rest/v1/rpc/rpc_decide_request")) {
      const body = parsedBody as { p_request_id: string; p_decision: string; p_note_or_reason: string | null };
      const req = requests.find((r) => r.id === body.p_request_id);
      if (!req) return jsonResponse({ message: "That request does not exist." }, 400);
      req.status = body.p_decision;
      if (body.p_decision === "approved") {
        req.approved_by = ADMIN_ID;
        req.approved_at = "2026-01-02T00:00:00.000Z";
      }
      return jsonResponse(req, 200);
    }

    if (url.includes("/rest/v1/rpc/rpc_worker_complete_request")) {
      const body = parsedBody as { p_request_id: string };
      const req = requests.find((r) => r.id === body.p_request_id);
      if (!req) return jsonResponse({ message: "That request does not exist." }, 400);
      req.status = "completed";
      req.entered_by = WORKER_BORNEM_ID;
      req.entered_at = "2026-01-02T01:00:00.000Z";
      return jsonResponse(req, 200);
    }

    if (url.includes("/rest/v1/rpc/rpc_register_shipment")) {
      const body = parsedBody as Record<string, string>;
      const created = {
        id: "40000000-0000-4000-a000-000000000009",
        reference: body.p_reference,
        direction: body.p_direction,
        purchase_order_id: "20000000-0000-4000-a000-000000000002",
        container_number: body.p_container_number || body.p_reference,
        warehouse_id: WH_BORNEM_ID,
        origin_country: "Belgium",
        destination_country: "Belgium",
        status: "Planned",
        carrier_name: "",
        handed_over_at: null,
        annex7_required: true,
        seller_status: "Pending",
        seller_company: body.p_party_name,
        seller_confirmed_by: "",
        seller_confirmed_at: "",
        override_reason: null,
        override_by: null,
        override_at: null,
      };
      shipments.push(created);
      return jsonResponse(created, 200);
    }

    if (url.includes("/rest/v1/rpc/rpc_worker_save_material_line")) {
      const body = parsedBody as Record<string, unknown>;
      return jsonResponse(
        {
          id: "60000000-0000-4000-a000-000000000001",
          request_id: "50000000-0000-4000-a000-000000000001",
          material_id: "70000000-0000-4000-a000-000000000001",
          packaging_type_id: body.p_packaging_type_id,
          package_count: body.p_package_count,
          gross_kg: body.p_gross_kg,
          tare_total_kg: 25,
          net_kg: Number(body.p_gross_kg) - 25,
        },
        200,
      );
    }

    if (url.includes("/rest/v1/rpc/rpc_worker_delete_material_line")) {
      const body = parsedBody as { p_line_id: string };
      return jsonResponse(body.p_line_id, 200);
    }

    if (url.includes("/rest/v1/rpc/rpc_save_carrier")) {
      const body = parsedBody as { p_reference: string; p_carrier_name: string; p_handed_over_at: string | null };
      const ship = shipments.find((s) => s.reference === body.p_reference);
      if (ship) {
        ship.carrier_name = body.p_carrier_name;
        ship.handed_over_at = body.p_handed_over_at;
      }
      return jsonResponse(ship ?? shipments[0], 200);
    }

    if (url.includes("/rest/v1/users")) {
      const idMatch = url.match(/id=eq\.([^&]+)/);
      if (idMatch) {
        const user = users[decodeURIComponent(idMatch[1])];
        return jsonResponse(user ? [user] : [], 200);
      }
      return jsonResponse(Object.values(users), 200);
    }

    if (url.includes("/rest/v1/warehouses")) {
      return jsonResponse([
        { id: WH_BORNEM_ID, name: "Bornem", country: "Belgium", active: true },
        { id: WH_TURNHOUT_ID, name: "Turnhout", country: "Belgium", active: true },
        { id: WH_SPAIN_ID, name: "Spain", country: "Spain", active: true },
        { id: WH_PAKISTAN_ID, name: "Pakistan", country: "Pakistan", active: true },
      ]);
    }

    if (url.includes("/rest/v1/purchase_orders")) {
      const numMatch = url.match(/number=eq\.([^&]+)/);
      if (numMatch) {
        const found = purchaseOrders.filter((p) => p.number === decodeURIComponent(numMatch[1]));
        return jsonResponse(found, 200);
      }
      return jsonResponse(purchaseOrders, 200);
    }

    if (url.includes("/rest/v1/shipments")) {
      return jsonResponse(shipments, 200);
    }

    if (url.includes("/rest/v1/requests")) {
      const idMatch = url.match(/id=eq\.([^&]+)/);
      if (idMatch) {
        const found = requests.filter((r) => r.id === decodeURIComponent(idMatch[1]));
        return jsonResponse(found, 200);
      }
      return jsonResponse(requests, 200);
    }

    if (url.includes("/rest/v1/documents")) {
      if (method === "POST") {
        const doc = parsedBody as Record<string, unknown>;
        documents.push(doc);
        return jsonResponse([doc], 201);
      }
      if (method === "PATCH") {
        const idMatch = url.match(/id=eq\.([^&]+)/);
        const doc = documents.find((d) => d.id === decodeURIComponent(idMatch?.[1] ?? ""));
        if (!doc) return jsonResponse([], 404);
        Object.assign(doc, parsedBody as Record<string, unknown>);
        return jsonResponse([doc], 200);
      }
      const idMatch = url.match(/id=eq\.([^&]+)/);
      if (idMatch) {
        return jsonResponse(
          documents.filter((d) => d.id === decodeURIComponent(idMatch[1])),
          200,
        );
      }
      return jsonResponse(documents, 200);
    }

    if (url.includes("/storage/v1/object/stockflow-files/")) {
      return jsonResponse({ Key: "stockflow-files/uploaded" }, 200);
    }

    return jsonResponse([], 200);
  };

  return { fetchImpl, calls };
}

test("Adapter selector defaults to local and switches to supabase when configured", () => {
  assert.equal(getDataAdapterMode({ NODE_ENV: "test" }), "local");
  assert.equal(getDataAdapterMode({ NODE_ENV: "test", STOCKFLOW_DATA_ADAPTER: "local" }), "local");
  assert.equal(getDataAdapterMode({ NODE_ENV: "test", STOCKFLOW_DATA_ADAPTER: "supabase" }), "supabase");

  const localAdapter = getDataAdapter({ NODE_ENV: "test", STOCKFLOW_DATA_ADAPTER: "local" });
  assert.ok(localAdapter instanceof LocalAdapter);

  const supaAdapter = getDataAdapter(TEST_ENV);
  assert.ok(supaAdapter instanceof SupabaseAdapter);
});

test("Supabase migration SQL and security test suite contain all required tables, RPCs, triggers, and Storage policies", () => {
  const migrationPath = path.join(process.cwd(), "supabase", "migrations", "0001_stockflow_complete.sql");
  const testSqlPath = path.join(process.cwd(), "supabase", "tests", "security_verification.sql");

  const migrationSql = readFileSync(migrationPath, "utf8");
  const testSql = readFileSync(testSqlPath, "utf8");

  const requiredTables = [
    "warehouses",
    "companies",
    "users",
    "materials",
    "packaging_types",
    "purchase_orders",
    "purchase_order_lines",
    "shipments",
    "request_sequences",
    "requests",
    "request_lines",
    "worker_general_requests",
    "worker_general_request_attachments",
    "documents",
    "request_photos",
    "stock_balances",
    "warehouse_transfers",
    "stock_movements",
    "customs_records",
    "demurrage_records",
    "annex7_records",
    "audit_log",
  ];

  for (const tbl of requiredTables) {
    assert.match(migrationSql, new RegExp(`create table public\\.${tbl}\\b`, "i"), `Missing table ${tbl}`);
    assert.match(
      migrationSql,
      new RegExp(`alter table public\\.${tbl} enable row level security`, "i"),
      `Missing enable RLS on ${tbl}`,
    );
    assert.match(
      migrationSql,
      new RegExp(`alter table public\\.${tbl} force row level security`, "i"),
      `Missing force RLS on ${tbl}`,
    );
  }

  const requiredRpcs = [
    "rpc_admin_decide_order",
    "rpc_decide_request",
    "rpc_upload_annex7",
    "rpc_decide_annex7",
    "rpc_register_shipment",
    "rpc_save_shipment_meta",
    "rpc_save_carrier",
    "rpc_advance_shipment",
    "rpc_save_customs",
    "rpc_confirm_customs",
    "rpc_confirm_seller",
    "rpc_save_cmr",
    "rpc_worker_save_material_line",
    "rpc_worker_delete_material_line",
    "rpc_submit_request_with_photos",
    "rpc_worker_soft_delete_request",
    "rpc_worker_complete_request",
    "rpc_worker_create_general_request",
    "rpc_decide_general_request",
    "rpc_worker_delete_document",
  ];

  for (const rpc of requiredRpcs) {
    assert.match(
      migrationSql,
      new RegExp(`create or replace function public\\.${rpc}\\b`, "i"),
      `Missing RPC definition for ${rpc}`,
    );
    assert.match(
      migrationSql,
      new RegExp(`grant execute on function public\\.${rpc}\\s*\\(`, "i"),
      `Missing GRANT EXECUTE for ${rpc}`,
    );
  }

  // Verify internal_append_audit protection and trigger depth guard
  assert.match(migrationSql, /pg_trigger_depth\(\)\s*<\s*1\s*and\s*coalesce\(current_setting\('stockflow\.in_trusted_rpc',\s*true\),\s*''\)\s*<>\s*'true'/i);
  assert.match(migrationSql, /revoke all on function public\.internal_append_audit\(uuid, text, text, text, text, text\) from public, anon, authenticated;/i);

  // Verify private storage bucket and storage.objects policies
  assert.match(migrationSql, /insert into storage\.buckets[\s\S]*'stockflow-files'[\s\S]*false,\s*10485760/i);
  assert.match(migrationSql, /create policy stockflow_storage_select on storage\.objects/i);
  assert.match(migrationSql, /create policy stockflow_storage_insert on storage\.objects/i);
  assert.match(migrationSql, /create policy stockflow_storage_worker_delete on storage\.objects/i);

  // Verify canonical StockFlow warehouses (Bornem, Turnhout, Spain, Pakistan) and absence of unverified Bremen
  for (const wh of ["Bornem", "Turnhout", "Spain", "Pakistan"]) {
    assert.match(migrationSql, new RegExp(`'${wh}'`), `Missing warehouse ${wh} in migration SQL`);
    assert.match(testSql, new RegExp(`'${wh}'`), `Missing warehouse ${wh} in security test SQL`);
  }
  assert.equal(migrationSql.includes("Bremen"), false, "Migration SQL must not contain unverified Bremen warehouse");
  assert.equal(testSql.includes("Bremen"), false, "Security test SQL must not contain unverified Bremen warehouse");

  // Verify security verification test script exercises positive and negative assertions
  assert.match(testSql, /TEST 1 \(POSITIVE\)/);
  assert.match(testSql, /TEST 12 \(NEGATIVE - Issue 4\)/);
  assert.match(testSql, /TEST 13 \(POSITIVE & NEGATIVE - Issue 5 & 6\)/);
});

test("SupabaseAdapter enforces 3-role permissions and invokes narrow RPCs with user Bearer JWT", async () => {
  const { fetchImpl, calls } = createMockSupabaseFetch();
  const adapter = createSupabaseAdapter(TEST_ENV, fetchImpl);
  const services = adapter.services();

  // Sign in all roles so their tokens are registered
  const adminSignIn = await adapter.signIn("admin@stockflow.test", "secret");
  assert.equal(adminSignIn.ok, true);

  const staffSignIn = await adapter.signIn("staff@stockflow.test", "secret");
  assert.equal(staffSignIn.ok, true);

  const bornemWorkerSignIn = await adapter.signIn("worker.bornem@stockflow.test", "secret");
  assert.equal(bornemWorkerSignIn.ok, true);

  const turnhoutWorkerSignIn = await adapter.signIn("worker.turnhout@stockflow.test", "secret");
  assert.equal(turnhoutWorkerSignIn.ok, true);

  // 1. Admin CANNOT create or edit POs, create shipments, or complete requests
  await assert.rejects(
    () =>
      services.purchaseOrders.create({
        supplier: "Nordic Metals",
        material: "Copper",
        quantityKg: 1000,
        valueEur: 5000,
        actorId: ADMIN_ID,
      }),
    /You do not have permission to perform this action/,
  );

  await assert.rejects(
    () =>
      services.purchaseOrders.edit({
        number: "PO-100",
        supplier: "Nordic Metals",
        material: "Copper",
        quantityKg: 2000,
        valueEur: 9000,
        actorId: ADMIN_ID,
      }),
    /You do not have permission to perform this action/,
  );

  await assert.rejects(
    () =>
      services.requests.complete({
        requestId: "50000000-0000-4000-a000-000000000001",
        actorId: ADMIN_ID,
      }),
    /You do not have permission to perform this action/,
  );

  // 2. Staff CANNOT approve POs or approve requests, and CANNOT edit an already approved PO
  await assert.rejects(
    () => services.purchaseOrders.approve({ number: "PO-100", actorId: STAFF_ID }),
    /You do not have permission to perform this action/,
  );

  const lockedEdit = await services.purchaseOrders.edit({
    number: "PO-APPROVED",
    supplier: "Nordic Metals",
    material: "Copper",
    quantityKg: 2000,
    valueEur: 9000,
    actorId: STAFF_ID,
  });
  assert.equal(lockedEdit.ok, false);
  if (!lockedEdit.ok) {
    assert.match(lockedEdit.error, /Approved or declined purchase orders are locked/i);
  }

  // 3. Admin CAN approve POs via rpc_admin_decide_order and approve requests via rpc_decide_request
  const poApproved = await services.purchaseOrders.approve({
    number: "PO-100",
    actorId: ADMIN_ID,
  });
  assert.equal(poApproved.ok, true);
  if (poApproved.ok) {
    assert.equal(poApproved.value.status, "approved");
  }

  const reqApproved = await services.requests.approve({
    requestId: "50000000-0000-4000-a000-000000000001",
    actorId: ADMIN_ID,
  });
  assert.equal(reqApproved.ok, true);
  if (reqApproved.ok) {
    assert.equal(reqApproved.value.status, "approved");
  }

  const decideReqCall = calls.find((c) => c.url.includes("/rest/v1/rpc/rpc_decide_request"));
  assert.ok(decideReqCall);
  assert.equal(decideReqCall.authHeader, "Bearer jwt-admin");

  // 4. Turnhout Worker CANNOT complete Bornem request (cross-warehouse denial)
  await assert.rejects(
    () =>
      services.requests.complete({
        requestId: "50000000-0000-4000-a000-000000000001",
        actorId: WORKER_TURNHOUT_ID,
      }),
    /You do not have permission to perform this action/,
  );

  // 5. Bornem Worker CAN complete approved Bornem request via rpc_worker_complete_request
  const reqCompleted = await services.requests.complete({
    requestId: "50000000-0000-4000-a000-000000000001",
    actorId: WORKER_BORNEM_ID,
  });
  assert.equal(reqCompleted.ok, true);
  if (reqCompleted.ok) {
    assert.equal(reqCompleted.value.status, "completed");
  }

  // 6. Bornem Worker CAN upload a validated PNG photo to stockflow-files
  const validPngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  const uploadTarget = await services.files.createUploadTarget({
    filename: "seal.png",
    mime: "image/png",
    byteSize: validPngBytes.byteLength,
    kind: "photo",
    shipmentId: "40000000-0000-4000-a000-000000000001",
    containerNumber: "MSCU1234567",
    warehouse: "Bornem",
    actorId: WORKER_BORNEM_ID,
  });
  assert.equal(uploadTarget.ok, true);
  if (uploadTarget.ok) {
    const confirmed = await services.files.confirmUpload({
      fileId: uploadTarget.value.fileId,
      bytesBase64: validPngBytes.toString("base64"),
      actorId: WORKER_BORNEM_ID,
    });
    assert.equal(confirmed.ok, true);
    if (confirmed.ok) {
      assert.equal(confirmed.value.status, "active");
    }
  }

  // 7. UI command payload shapes map cleanly through SupabaseAdapter.run
  const addInboundRes = await adapter.run("jwt-staff", "addInbound", {
    number: "IN-BOR-02",
    po: "PO-APPROVED",
    supplier: "Nordic Metals",
    warehouse: "Bornem",
  });
  assert.equal(addInboundRes.error, undefined);
  assert.match(addInboundRes.notice ?? "", /IN-BOR-02 was registered/);

  const countModeBlocked = await adapter.run("jwt-worker-bornem", "saveMaterial", {
    shipment: "IN-BOR-01",
    direction: "inbound",
    material: "Copper",
    mode: "count",
  });
  assert.match(countModeBlocked.error ?? "", /Count-only lines are not stored/);

  const savedLine = await adapter.run("jwt-worker-bornem", "saveMaterial", {
    shipment: "IN-BOR-01",
    direction: "inbound",
    material: "Copper",
    mode: "weight",
    grossKg: 525,
    packagingId: "80000000-0000-4000-a000-000000000001",
    packagingQty: 1,
    tarePerUnitKg: 25,
    noTare: false,
  });
  assert.equal(savedLine.error, undefined);

  const deletedLine = await adapter.run("jwt-worker-bornem", "deleteMaterial", {
    direction: "inbound",
    shipment: "IN-BOR-01",
    sectionId: "60000000-0000-4000-a000-000000000001",
  });
  assert.equal(deletedLine.error, undefined);

  const savedCarrier = await adapter.run("jwt-worker-bornem", "saveCarrier", {
    number: "IN-BOR-01",
    carrier: "EuroFreight",
    handover: "2026-10-22T10:00",
  });
  assert.equal(savedCarrier.error, undefined);
});
