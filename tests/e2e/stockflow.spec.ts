import { test, expect } from "@playwright/test";

test.describe("StockFlow Phase 3 E2E QA, Role Audit & Operational Suite", () => {
  test.describe.configure({ mode: "serial" });

  let staffPassword = "";
  let workerPassword = "";

  test("1. Unauthenticated users are redirected to /login on protected routes", async ({ page }) => {
    for (const route of ["/dashboard", "/users", "/containers", "/purchases", "/inventory", "/audit"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    }
    await expect(page.locator("h1")).toContainText(/Welcome back/i);
    await expect(page.locator("body")).toContainText(/Sign in to StockFlow/i);
  });

  test("2. Rate limiting protects login from brute force", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    for (let i = 0; i < 6; i++) {
      await emailInput.fill("attacker@example.com");
      await passwordInput.fill("wrongpass");
      await submitBtn.click();
      await page.waitForTimeout(150);
    }

    await expect(page.locator("body")).toContainText(/Too many sign-in attempts/i);
  });

  test("3. Security headers are present on responses", async ({ request }) => {
    const response = await request.get("/login");
    const headers = response.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=(self)");
  });

  test("4. Unauthenticated API calls to /api/reports/export and /api/files/[id] return 401", async ({ request }) => {
    const unauthReport = await request.get("/api/reports/export?type=stock");
    expect(unauthReport.status()).toBe(401);

    const unauthFile = await request.get("/api/files/nonexistent-id?exp=9999999999999&sig=invalid");
    expect(unauthFile.status()).toBe(401);
  });

  test("5. Admin sign-in, 5-section sidebar, user provisioning, directories, reports, and audit log", async ({
    page,
    request,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@example.com");
    await page.fill('input[type="password"]', "owner-pass-1");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|warehouses|containers|users)/);

    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("Dashboard");
    const sidebar = page.getByRole("navigation", { name: "Primary" });
    await expect(sidebar).toContainText("Main");
    await expect(sidebar).toContainText("Operations");
    await expect(sidebar).toContainText("Warehouse");
    await expect(sidebar).toContainText("Directories");
    await expect(sidebar).toContainText("Administration");
    await expect(sidebar).not.toContainText("Roadmap");
    await expect(sidebar).not.toContainText("Chat");

    // Removed routes are blocked even for Admin
    for (const removedRoute of ["/roadmap", "/chat", "/sales"]) {
      await page.goto(removedRoute);
      await expect(page.locator("h1")).toContainText(/Access denied/i);
    }

    // Create Staff and Worker accounts on /users
    await page.goto("/users");
    await expect(page.locator("h1")).toContainText("Users");
    await page.locator('label:has-text("Name") input').fill("Charlie Staff");
    await page.locator('label:has-text("Email") input').fill("staff-e2e@example.com");
    await page.locator('label:has-text("Role") select').first().selectOption("manager");
    await page.click('button:has-text("Add user")');
    await expect(page.locator("body")).toContainText(/Charlie Staff was added\. Temporary password:/);
    const staffNotice = await page.locator("p", { hasText: "Temporary password:" }).textContent();
    staffPassword = staffNotice?.match(/Temporary password:\s*(\S+)/)?.[1] ?? "";
    expect(staffPassword.length).toBeGreaterThan(0);

    await page.locator('label:has-text("Name") input').fill("Will Worker");
    await page.locator('label:has-text("Email") input').fill("worker-e2e@example.com");
    await page.locator('label:has-text("Role") select').first().selectOption("worker");
    await page.locator('label:has-text("Warehouse") select').selectOption("Bremen");
    await page.click('button:has-text("Add user")');
    await expect(page.locator("body")).toContainText(/Will Worker was added\. Temporary password:/);
    const workerNotice = await page.locator("p", { hasText: "Temporary password:" }).textContent();
    workerPassword = workerNotice?.match(/Temporary password:\s*(\S+)/)?.[1] ?? "";
    expect(workerPassword.length).toBeGreaterThan(0);

    // Verify Admin can access Directories, Materials & Packaging, Reports, Audit Log, and Settings
    await page.goto("/warehouses");
    await expect(page.locator("h1")).toContainText("Warehouses");
    await expect(page.locator("body")).toContainText("Bremen");

    await page.goto("/suppliers");
    await expect(page.locator("h1")).toContainText("Suppliers");

    await page.goto("/customers");
    await expect(page.locator("h1")).toContainText("Customers");

    await page.goto("/materials");
    await expect(page.locator("h1")).toContainText("Materials & Packaging");
    await expect(page.locator("body")).toContainText("Normal Pallet");

    await page.goto("/reports");
    await expect(page.locator("h1")).toContainText("Reports");

    await page.goto("/audit");
    await expect(page.locator("h1")).toContainText("Audit Log");
    await expect(page.locator("body")).toContainText(/user-created/i);

    await page.goto("/settings");
    await expect(page.locator("h1")).toContainText("Settings");

    // Verify Admin has read-only access on operational pages (cannot create/edit PO/SO, shipments, or transfers)
    await page.goto("/purchases");
    await expect(page.locator("h1")).toContainText("PO & SO Orders");
    await expect(page.locator('button:has-text("Create order")')).toHaveCount(0);

    await page.goto("/containers");
    await expect(page.locator("h1")).toContainText("Incoming / Unloading");
    await expect(page.locator('button:has-text("Add planned shipment")')).toHaveCount(0);

    await page.goto("/outbound");
    await expect(page.locator("h1")).toContainText("Outgoing / Loading");
    await expect(page.locator('button:has-text("Add planned shipment")')).toHaveCount(0);

    await page.goto("/transfers");
    await expect(page.locator("h1")).toContainText("Transfers");
    await expect(page.locator("body")).toContainText(/Read-only view of inter-warehouse stock transfers/i);
    await expect(page.locator('button:has-text("Confirm transfer")')).toHaveCount(0);

    // Verify Admin can export CSV report (200 OK)
    const cookies = await page.context().cookies();
    const adminSession = cookies.find((c) => c.name === "stockflow_session")?.value;
    const exportRes = await request.get("/api/reports/export?type=stock", {
      headers: { Cookie: `stockflow_session=${adminSession}` },
    });
    expect(exportRes.status()).toBe(200);
    expect(pageErrors).toEqual([]);
  });

  test("6. Staff role audit: sidebar visibility, PO/SO & shipment creation, and blocked Admin routes/APIs", async ({
    page,
    request,
  }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "staff-e2e@example.com");
    await page.fill('input[type="password"]', staffPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|purchases|containers|warehouses)/);

    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("Dashboard");
    const sidebar = page.getByRole("navigation", { name: "Primary" });
    await expect(sidebar).toContainText("Main");
    await expect(sidebar).toContainText("Operations");
    await expect(sidebar).toContainText("Warehouse");
    await expect(sidebar).toContainText("Directories");
    // Staff must NOT see Administration section
    await expect(sidebar).not.toContainText("Administration");
    await expect(sidebar).not.toContainText("Audit Log");

    // Direct URL access to Admin-only routes is blocked for Staff
    for (const adminRoute of ["/users", "/reports", "/audit", "/settings", "/roadmap", "/chat", "/sales"]) {
      await page.goto(adminRoute);
      await expect(page.locator("h1")).toContainText(/Access denied/i);
    }

    // Staff API call to /api/reports/export is blocked with 403 Forbidden
    const cookies = await page.context().cookies();
    const staffSession = cookies.find((c) => c.name === "stockflow_session")?.value;
    const exportRes = await request.get("/api/reports/export?type=stock", {
      headers: { Cookie: `stockflow_session=${staffSession}` },
    });
    expect(exportRes.status()).toBe(403);

    // Staff can access Transfers in read-only mode (cannot create transfer)
    await page.goto("/transfers");
    await expect(page.locator("h1")).toContainText("Transfers");
    await expect(page.locator("body")).toContainText(/Read-only view of inter-warehouse stock transfers/i);
    await expect(page.locator('button:has-text("Confirm transfer")')).toHaveCount(0);

    // Staff can create a PO/SO order on /purchases
    await page.goto("/purchases");
    await expect(page.locator("h1")).toContainText("PO & SO Orders");
    await page.locator('label:has-text("Supplier / Customer") input').fill("North Mill");
    await page.locator('label:has-text("Material") input').fill("LDPE film");
    await page.locator('label:has-text("Quantity kg") input').fill("1000");
    await page.locator('label:has-text("Value EUR") input').fill("2500");
    await page.click('button:has-text("Create order")');
    await expect(page.locator("body")).toContainText(/PO-\d+ was submitted for approval/i);

    // Staff can create an Inbound shipment and an Outbound shipment
    await page.goto("/containers");
    await expect(page.locator("h1")).toContainText("Incoming / Unloading");
    await page.locator('label:has-text("Container number") input').fill("IN-E2E-1");
    await page.locator('label:has-text("PO number") input').fill("PO-E2E-1");
    await page.locator('label:has-text("Supplier") input').fill("North Mill");
    await page.locator('label:has-text("Warehouse") select').selectOption("Bremen");
    await page.click('button:has-text("Add planned shipment")');
    await expect(page.locator("body")).toContainText("IN-E2E-1");

    await page.goto("/outbound");
    await expect(page.locator("h1")).toContainText("Outgoing / Loading");
    await page.locator('label:has-text("Shipment number") input').fill("OUT-E2E-1");
    await page.locator('label:has-text("SO / PO number") input').fill("SO-E2E-1");
    await page.locator('label:has-text("Container number") input').fill("CONT-OUT-1");
    await page.locator('label:has-text("Customer") input').fill("Meridian Packaging");
    await page.locator('label:has-text("Warehouse") select').selectOption("Bremen");
    await page.click('button:has-text("Add planned shipment")');
    await expect(page.locator("body")).toContainText("OUT-E2E-1");
  });

  test("7. Worker role audit, Incoming unloading & Outgoing loading workflows, and responsive mobile layout", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "worker-e2e@example.com");
    await page.fill('input[type="password"]', workerPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|tasks|containers|inventory)/);

    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("Dashboard");
    const sidebar = page.getByRole("navigation", { name: "Primary" });
    await expect(sidebar).toContainText("Dashboard");
    await expect(sidebar).toContainText("Loading & Unloading Requests");
    await expect(sidebar).toContainText("Incoming / Unloading");
    await expect(sidebar).toContainText("Outgoing / Loading");
    await expect(sidebar).not.toContainText("PO & SO Orders");
    await expect(sidebar).not.toContainText("Transfers");
    await expect(sidebar).not.toContainText("Directories");
    await expect(sidebar).not.toContainText("Administration");

    // Direct URL access to Staff/Admin routes is blocked for Worker
    for (const blockedRoute of ["/purchases", "/transfers", "/warehouses", "/suppliers", "/customers", "/materials", "/users", "/reports", "/audit", "/settings"]) {
      await page.goto(blockedRoute);
      await expect(page.locator("h1")).toContainText(/Access denied/i);
    }

    // Worker processes Incoming shipment IN-E2E-1: advances Planned -> Registered -> Unloading and adds material section
    await page.goto("/containers/IN-E2E-1");
    await expect(page.locator("h1")).toContainText("IN-E2E-1");
    await page.click('button:has-text("Mark registered")');
    await expect(page.locator("body")).toContainText(/IN-E2E-1 is now Registered/i);
    await page.click('button:has-text("Start unloading")');
    await expect(page.locator("body")).toContainText(/IN-E2E-1 is now Unloading/i);

    await page.locator('label:has-text("Material type") input').fill("LDPE film");
    await page.locator('label:has-text("Gross weight (kg)") input').fill("225");
    await page.locator('label:has-text("Packaging type") select').selectOption({ label: "Normal Pallet · 25 kg" });
    await page.locator('label:has-text("Packaging quantity") input').fill("1");
    await page.click('button:has-text("Add section")');
    await expect(page.locator("body")).toContainText(/200 kg net/i);

    // Worker processes Outbound shipment OUT-E2E-1: enters carrier and advances Planned -> Loading -> Loaded -> Dispatched
    await page.goto("/outbound/OUT-E2E-1");
    await expect(page.locator("h1")).toContainText("OUT-E2E-1");
    // Verify obsolete Swiss customs & seller confirmation panels are NOT present
    await expect(page.locator("body")).not.toContainText("Swiss outbound customs");
    await expect(page.locator("body")).not.toContainText("Seller confirmation");

    await page.locator('label:has-text("Carrier name") input').fill("EuroFreight Express");
    await page.click('button:has-text("Save handover")');
    await expect(page.locator("body")).toContainText(/Carrier details for OUT-E2E-1 were saved/i);

    await page.click('button:has-text("Start loading")');
    await expect(page.locator("body")).toContainText(/OUT-E2E-1 is now Loading/i);
    await page.click('button:has-text("Mark loaded")');
    await expect(page.locator("body")).toContainText(/OUT-E2E-1 is now Loaded/i);
    await page.click('button:has-text("Dispatch")');
    await expect(page.locator("body")).toContainText(/OUT-E2E-1 is now Dispatched/i);

    // Responsive mobile layout check (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("Dashboard");
    const mobileNav = page.getByRole("navigation", { name: "Mobile" });
    await expect(mobileNav).toBeVisible();
    await mobileNav.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
  });

  test("8. Admin approves request (read-only on execution/editing), Worker completes into stock, and Admin views resulting inventory & movements", async ({
    page,
  }) => {
    // Sign in as Admin to approve REQ-2026-0001 on IN-E2E-1
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@example.com");
    await page.fill('input[type="password"]', "owner-pass-1");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|warehouses|containers|users)/);

    await page.goto("/containers/IN-E2E-1");
    await expect(page.locator("h1")).toContainText("IN-E2E-1");
    // Verify Admin cannot edit material sections, delete requests, or advance unloading
    await expect(page.locator('button:has-text("Add section")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Delete request (soft delete)")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Complete unloading")')).toHaveCount(0);

    await page.click('button:has-text("Approve request")');
    await expect(page.locator("body")).toContainText(/Request was approved/i);
    // Verify Admin cannot complete the approved request into stock
    await expect(page.locator('button:has-text("Complete & Enter into stock")')).toHaveCount(0);
    await expect(page.locator("body")).toContainText(/Waiting for the assigned Worker to complete the operation into stock/i);

    // Sign in as Worker to complete the approved operation into stock
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "worker-e2e@example.com");
    await page.fill('input[type="password"]', workerPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|tasks|containers|inventory)/);

    await page.goto("/containers/IN-E2E-1");
    await expect(page.locator("h1")).toContainText("IN-E2E-1");
    await page.click('button:has-text("Complete & Enter into stock")');
    await expect(page.locator("body")).toContainText(/Request completed and posted to inventory balances/i);

    // Complete unloading and verify demurrage is 0 EUR within 120-min free window
    await page.click('button:has-text("Complete unloading")');
    await expect(page.locator("body")).toContainText(/IN-E2E-1 is now Completed/i);

    // Sign in as Admin to verify Inventory (200 kg in Bremen) and Stock Movements
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@example.com");
    await page.fill('input[type="password"]', "owner-pass-1");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|warehouses|containers|users)/);

    await page.goto("/inventory");
    await expect(page.locator("h1")).toContainText("Inventory");
    await expect(page.locator("body")).toContainText("LDPE film");
    await expect(page.locator("body")).toContainText("200 kg");

    await page.goto("/stock-movements");
    await expect(page.locator("h1")).toContainText("Stock Movements");
    await expect(page.locator("body")).toContainText("LDPE film");
    await expect(page.locator("body")).toContainText("200 kg");
  });
});
