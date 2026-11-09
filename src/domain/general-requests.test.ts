import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "./local-adapter.ts";

const now = "2026-11-09T10:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bornem", country: "Belgium" },
    { name: "Turnhout", country: "Belgium" },
    { name: "Spain", country: "Spain" },
    { name: "Pakistan", country: "Pakistan" },
  ],
  companies: [{ name: "Meridian Packaging", kind: "customer" }],
  materials: [{ materialNumber: "LDPE", description: "LDPE film", unit: "kg", lowStockThresholdKg: 25 }],
  packagingTypes: [{ name: "Normal Pallet", tareKg: 25 }],
});

function env(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    STOCKFLOW_OWNER_EMAIL: "owner@example.com",
    STOCKFLOW_OWNER_NAME: "Ada Owner",
    STOCKFLOW_OWNER_PASSWORD: "owner-pass-1",
    STOCKFLOW_REFERENCE_JSON: reference,
  };
}

function createTestAdapter() {
  const dir = mkdtempSync(path.join(tmpdir(), "stockflow-req-test-"));
  const file = path.join(dir, "store.json");
  return { dir, store: createLocalAdapter(file, env(), () => now) };
}

test("Worker can create requests across all 6 categories with attachments", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    // Add Bob Worker at Bornem
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Bob Worker",
      email: "bob@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const bobSign = await store.signIn("bob@example.com", "worker-pass-1");
    assert.equal(bobSign.ok, true);
    if (!bobSign.ok) return;

    const categories = [
      "materials_packaging",
      "stock_issue",
      "loading_unloading",
      "equipment_maintenance",
      "missing_documents",
      "other",
    ] as const;

    // Valid sample 1x1 GIF image in base64
    const validGifBase64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    for (const cat of categories) {
      const res = await store.run(bobSign.value.sessionId, "createGeneralRequest", {
        category: cat,
        priority: "high",
        description: `Operational need for ${cat}`,
        attachments: [
          {
            name: `proof-${cat}.gif`,
            bytesBase64: validGifBase64,
          },
        ],
      });

      assert.equal(res.error, undefined, `Failed to create request for ${cat}`);
      assert.ok(res.notice?.includes("submitted"));
    }

    const view = await store.view(bobSign.value.sessionId);
    assert.equal(view.state.generalRequests.length, 6);
    for (const req of view.state.generalRequests) {
      assert.equal(req.createdByName, "Bob Worker");
      assert.equal(req.warehouse, "Bornem");
      assert.equal(req.status, "submitted");
      assert.equal(req.attachments.length, 1);
      assert.match(req.number, /^REQ-\d{4}-\d{4}$/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Worker privacy: Workers can ONLY see and track their own requests", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    // Add Bob Worker and Alice Worker, both at Bornem
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Bob Worker",
      email: "bob@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "pass-bob",
    });
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Alice Worker",
      email: "alice@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "pass-alice",
    });

    const bobSign = await store.signIn("bob@example.com", "pass-bob");
    const aliceSign = await store.signIn("alice@example.com", "pass-alice");
    assert.equal(bobSign.ok && aliceSign.ok, true);
    if (!bobSign.ok || !aliceSign.ok) return;

    // Bob creates a request
    await store.run(bobSign.value.sessionId, "createGeneralRequest", {
      category: "stock_issue",
      description: "Bob's private stock issue report",
    });

    // Alice creates a request
    await store.run(aliceSign.value.sessionId, "createGeneralRequest", {
      category: "equipment_maintenance",
      description: "Alice's forklift repair request",
    });

    // Bob views state -> Bob must ONLY see Bob's request
    const bobView = await store.view(bobSign.value.sessionId);
    assert.equal(bobView.state.generalRequests.length, 1);
    assert.equal(bobView.state.generalRequests[0]?.description, "Bob's private stock issue report");
    assert.equal(bobView.state.generalRequests[0]?.createdByName, "Bob Worker");

    // Alice views state -> Alice must ONLY see Alice's request
    const aliceView = await store.view(aliceSign.value.sessionId);
    assert.equal(aliceView.state.generalRequests.length, 1);
    assert.equal(aliceView.state.generalRequests[0]?.description, "Alice's forklift repair request");
    assert.equal(aliceView.state.generalRequests[0]?.createdByName, "Alice Worker");

    // Admin views state -> Admin sees all requests
    const adminView = await store.view(ownerSign.value.sessionId);
    assert.equal(adminView.state.generalRequests.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Staff lifecycle: can review (under_review), request info (sent_back), and process approved work (completed), but CANNOT approve or reject", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    // Add Staff (manager) and Worker
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Charlie Manager",
      email: "charlie@example.com",
      role: "manager",
      warehouse: null,
      password: "pass-charlie",
    });
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Bob Worker",
      email: "bob@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "pass-bob",
    });

    const charlieSign = await store.signIn("charlie@example.com", "pass-charlie");
    const bobSign = await store.signIn("bob@example.com", "pass-bob");
    assert.equal(charlieSign.ok && bobSign.ok, true);
    if (!charlieSign.ok || !bobSign.ok) return;

    // Bob submits request
    const createRes = await store.run(bobSign.value.sessionId, "createGeneralRequest", {
      category: "materials_packaging",
      description: "Need 20 extra pallets",
    });
    const req = createRes.state.generalRequests[0];
    assert.ok(req);

    // Charlie (Staff) marks under_review
    const reviewRes = await store.run(charlieSign.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "under_review",
    });
    assert.equal(reviewRes.error, undefined);
    assert.equal(reviewRes.state.generalRequests.find((r) => r.id === req.id)?.status, "under_review");

    // Charlie requests info without note -> must fail
    const failNote = await store.run(charlieSign.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "sent_back",
      note: "",
    });
    assert.ok(failNote.error?.includes("note is required"));

    // Charlie requests info with note -> succeeds
    const sentBackRes = await store.run(charlieSign.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "sent_back",
      note: "Please specify pallet size: Euro or Standard?",
    });
    assert.equal(sentBackRes.error, undefined);
    const sentBackReq = sentBackRes.state.generalRequests.find((r) => r.id === req.id);
    assert.equal(sentBackReq?.status, "sent_back");
    assert.equal(sentBackReq?.responseNote, "Please specify pallet size: Euro or Standard?");

    // Charlie attempts to approve -> MUST BE BLOCKED
    const blockApprove = await store.run(charlieSign.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "approved",
    });
    assert.ok(blockApprove.error?.includes("Only Admin"));

    // Charlie attempts to decline/reject -> MUST BE BLOCKED
    const blockDecline = await store.run(charlieSign.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "declined",
      reason: "No budget",
    });
    assert.ok(blockDecline.error?.includes("Only Admin"));

    // Admin approves the request
    const adminApprove = await store.run(ownerSign.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "approved",
      responseNote: "Approved for standard Euro pallets.",
    });
    assert.equal(adminApprove.error, undefined);
    assert.equal(adminApprove.state.generalRequests.find((r) => r.id === req.id)?.status, "approved");

    // Charlie (Staff) processes approved work into completed
    const completeRes = await store.run(charlieSign.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "completed",
    });
    assert.equal(completeRes.error, undefined);
    assert.equal(completeRes.state.generalRequests.find((r) => r.id === req.id)?.status, "completed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Admin lifecycle & operational read-only enforcement: Admin can approve and reject with reason, but cannot edit operational content", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Bob Worker",
      email: "bob@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "pass-bob",
    });

    const bobSign = await store.signIn("bob@example.com", "pass-bob");
    assert.equal(bobSign.ok, true);
    if (!bobSign.ok) return;

    // Bob creates request
    const createRes = await store.run(bobSign.value.sessionId, "createGeneralRequest", {
      category: "equipment_maintenance",
      description: "Forklift hydraulic fluid leaking",
    });
    const req = createRes.state.generalRequests[0];
    assert.ok(req);

    // Admin attempts to submit worker request -> BLOCKED (operational separation)
    const adminSubmit = await store.run(ownerSign.value.sessionId, "createGeneralRequest", {
      category: "other",
      description: "Admin attempting to create worker request",
    });
    assert.ok(adminSubmit.error?.includes("Only a Worker"));

    // Admin rejects without reason -> must fail
    const rejectNoReason = await store.run(ownerSign.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "declined",
      reason: "",
    });
    assert.ok(rejectNoReason.error?.includes("decline reason is required"));

    // Admin rejects with reason -> succeeds
    const rejectRes = await store.run(ownerSign.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "declined",
      reason: "Maintenance vendor already scheduled for tomorrow at 08:00.",
    });
    assert.equal(rejectRes.error, undefined);
    const rejectedReq = rejectRes.state.generalRequests.find((r) => r.id === req.id);
    assert.equal(rejectedReq?.status, "declined");
    assert.equal(rejectedReq?.responseNote, "Maintenance vendor already scheduled for tomorrow at 08:00.");

    // Worker can see rejection reason and can delete own declined request
    const bobView = await store.view(bobSign.value.sessionId);
    assert.equal(bobView.state.generalRequests[0]?.responseNote, "Maintenance vendor already scheduled for tomorrow at 08:00.");
    const deleteRes = await store.run(bobSign.value.sessionId, "deleteGeneralRequest", {
      requestId: req.id,
    });
    assert.equal(deleteRes.error, undefined);
    const bobViewAfter = await store.view(bobSign.value.sessionId);
    assert.equal(bobViewAfter.state.generalRequests.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Worker attachment access privacy: Alice Worker cannot access Bob Worker's request attachments", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    // Add Bob Worker and Alice Worker, both at Bornem
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Bob Worker",
      email: "bob@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "pass-bob",
    });
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Alice Worker",
      email: "alice@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "pass-alice",
    });

    const bobSign = await store.signIn("bob@example.com", "pass-bob");
    const aliceSign = await store.signIn("alice@example.com", "pass-alice");
    assert.equal(bobSign.ok && aliceSign.ok, true);
    if (!bobSign.ok || !aliceSign.ok) return;

    const validGifBase64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    // Bob creates a request with an attachment
    const bobReqRes = await store.run(bobSign.value.sessionId, "createGeneralRequest", {
      category: "equipment_maintenance",
      description: "Broken pallet jack with hydraulic leak",
      attachments: [
        {
          name: "jack-leak.gif",
          bytesBase64: validGifBase64,
        },
      ],
    });
    assert.equal(bobReqRes.error, undefined);

    const bobView = await store.view(bobSign.value.sessionId);
    assert.equal(bobView.state.generalRequests.length, 1);
    const bobReq = bobView.state.generalRequests[0];
    assert.equal(bobReq.attachments.length, 1);
    const attachmentDocId = bobReq.attachments[0].documentId;
    const attachmentStorageKey = bobReq.attachments[0].storageKey;

    // Alice views workspace -> Alice sees 0 requests and 0 attachments
    const aliceView = await store.view(aliceSign.value.sessionId);
    assert.equal(aliceView.state.generalRequests.length, 0);

    // Snapshot store to verify doc ownership
    const snapshot = await store.snapshot(aliceSign.value.sessionId);
    const doc = snapshot.documents.find((d) => d.id === attachmentDocId || d.storageKey === attachmentStorageKey);
    assert.ok(doc);
    assert.equal(doc.createdBy, snapshot.users.find((u) => u.email === "bob@example.com")?.id);

    // Verify general request attachment linkage
    const link = snapshot.workerGeneralRequestAttachments?.find((a) => a.documentId === doc.id);
    assert.ok(link);
    const parentReq = snapshot.workerGeneralRequests?.find((gr) => gr.id === link.generalRequestId);
    assert.ok(parentReq);
    assert.notEqual(parentReq.createdBy, snapshot.users.find((u) => u.email === "alice@example.com")?.id);

    // Admin views workspace -> Admin sees Bob's request and can access attachment
    const adminView = await store.view(ownerSign.value.sessionId);
    assert.equal(adminView.state.generalRequests.length, 1);
    assert.equal(adminView.state.generalRequests[0].attachments.length, 1);
    assert.equal(adminView.state.generalRequests[0].attachments[0].name, "REQ-2026-0001_PHOTO_1.gif");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

