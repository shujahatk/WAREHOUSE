"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, Surface } from "@/components/ref/chrome";
import { Icon } from "@/components/icons";

type TimeRange = "7d" | "30d" | "90d" | "all";

export function ManagementDashboard() {
  const { state, actor } = useDemo();
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  const isOwner = actor?.role === "owner";
  const isManager = actor?.role === "manager";
  const isModerator = actor?.role === "moderator";

  // Filter stock balances by selected warehouse
  const filteredStock = useMemo(() => {
    if (selectedWarehouse === "all") return state.stock;
    return state.stock.filter((s) => s.warehouse.toLowerCase() === selectedWarehouse.toLowerCase());
  }, [state.stock, selectedWarehouse]);

  // Total inventory metrics
  const totalWeightKg = useMemo(() => {
    return filteredStock.reduce((sum, item) => sum + item.quantity, 0);
  }, [filteredStock]);

  const totalTons = (totalWeightKg / 1000).toFixed(1);

  // Approximate valuation based on orders / offers average unit prices (~€1.20/kg baseline)
  const totalValuationEur = useMemo(() => {
    const totalOrdersVal = state.orders.reduce((sum, o) => sum + (o.valueEur || 0), 0);
    const avgPricePerKg = totalOrdersVal > 0 ? totalOrdersVal / Math.max(1, totalWeightKg) : 1.25;
    return Math.round(totalWeightKg * (avgPricePerKg || 1.25));
  }, [state.orders, totalWeightKg]);

  // Order metrics
  const pendingOrders = state.orders.filter((o) => o.status === "Pending");
  const approvedOrders = state.orders.filter((o) => o.status === "Approved");
  const completedOrders = state.orders.filter((o) => o.status === "Received");

  // Offer pipeline metrics
  const totalOffers = state.offers || [];
  const wonOffers = totalOffers.filter((o) => o.statusKey === "won");
  const wonValueEur = wonOffers.reduce((sum, o) => sum + (o.totalValue || 0), 0);
  const activePipelineValueEur = totalOffers
    .filter((o) => o.statusKey === "under_review" || o.approvalStatus === "approved" || o.statusKey === "negotiating")
    .reduce((sum, o) => sum + (o.totalValue || 0), 0);

  // Demurrage metrics
  const totalDemurrageEur = useMemo(() => {
    const records = (state.containers || []).map((c) => c.demurrage);
    return records.reduce((sum, d) => sum + (d?.chargeEUR || 0), 0);
  }, [state.containers]);

  // Warehouse breakdown calculation
  const warehouseBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of state.stock) {
      const current = map.get(item.warehouse) || 0;
      map.set(item.warehouse, current + item.quantity);
    }
    const result = Array.from(map.entries()).map(([name, weight]) => ({
      name,
      weight,
      tons: (weight / 1000).toFixed(1),
    }));
    result.sort((a, b) => b.weight - a.weight);
    return result;
  }, [state.stock]);

  const maxWarehouseWeight = useMemo(() => {
    return Math.max(...warehouseBreakdown.map((w) => w.weight), 1000);
  }, [warehouseBreakdown]);

  // Carriers demurrage breakdown
  const carrierDemurrage = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of state.containers) {
      const carrier = c.supplier || c.origin || "Direct Freight";
      const cost = c.demurrage?.chargeEUR || 0;
      map.set(carrier, (map.get(carrier) || 0) + cost);
    }
    return Array.from(map.entries())
      .map(([carrier, cost]) => ({ carrier, cost }))
      .sort((a, b) => b.cost - a.cost);
  }, [state.containers]);

  if (!isOwner && !isManager && !isModerator) {
    return (
      <Surface className="p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
          <Icon name="reports" className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-neutral-900">Management Analytics Scoped</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Executive analytics and financial metrics are visible to Administrators, Operations Managers, and Offer Moderators.
        </p>
      </Surface>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          title="Management Analytics"
          subtitle="Real-time multi-warehouse operations, inventory valuation, active pipeline, and demurrage risk."
        />
        <div className="flex flex-wrap items-center gap-2">
          {/* Warehouse Selector */}
          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-800 shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          >
            <option value="all">All Warehouses</option>
            <option value="bornem">Bornem (Belgium)</option>
            <option value="turnhout">Turnhout (Belgium)</option>
            <option value="spain">Spain</option>
            <option value="pakistan">Pakistan</option>
          </select>

          {/* Time Range Selector */}
          <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 text-xs shadow-xs">
            {(
              [
                { id: "7d", label: "7D" },
                { id: "30d", label: "30D" },
                { id: "90d", label: "90D" },
                { id: "all", label: "All" },
              ] as const
            ).map((range) => (
              <button
                key={range.id}
                type="button"
                onClick={() => setTimeRange(range.id)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${timeRange === range.id ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"
                  }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Inventory Volume */}
        <Surface className="p-5">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-medium">
            <span>Inventory Volume</span>
            <Icon name="inventory" className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-950">
              {totalTons}
            </span>
            <span className="text-xs font-medium text-neutral-500">metric tons</span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {totalWeightKg.toLocaleString()} kg stored across {selectedWarehouse === "all" ? "4 locations" : selectedWarehouse}
          </p>
        </Surface>

        {/* KPI 2: Inventory Valuation */}
        <Surface className="p-5">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-medium">
            <span>Inventory Valuation</span>
            <Icon name="purchases" className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-950">
              €{totalValuationEur.toLocaleString()}
            </span>
            <span className="text-xs font-medium text-emerald-600">active stock</span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Average stock value based on PO procurement
          </p>
        </Surface>

        {/* KPI 3: Orders Throughput */}
        <Surface className="p-5">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-medium">
            <span>Purchase & Sales Orders</span>
            <Icon name="documents" className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-950">
              {state.orders.length}
            </span>
            <span className="text-xs font-medium text-neutral-500">total orders</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-amber-600 font-medium">{pendingOrders.length} pending</span>
            <span>•</span>
            <span className="text-emerald-600 font-medium">{approvedOrders.length} approved</span>
          </div>
        </Surface>

        {/* KPI 4: Offer Pipeline / Demurrage */}
        <Surface className="p-5">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-medium">
            <span>Active Offer Pipeline</span>
            <Icon name="sales" className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-950">
              €{activePipelineValueEur.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {wonOffers.length} won (€{wonValueEur.toLocaleString()}) · {totalOffers.length} registered offers
          </p>
        </Surface>
      </div>

      {/* Charts Section: Row 1 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chart 1: Stock by Warehouse (Responsive SVG Horizontal Bar Chart) */}
        <Surface className="p-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950">Stock by Warehouse Distribution</h3>
              <p className="text-xs text-neutral-500">Total cargo weight (metric tons) per operational facility</p>
            </div>
            <Link href="/inventory" className="text-xs font-medium text-blue-600 hover:text-blue-800">
              View inventory →
            </Link>
          </div>

          <div className="mt-4 space-y-4">
            {warehouseBreakdown.length === 0 ? (
              <p className="text-xs text-neutral-500 py-6 text-center">No inventory recorded.</p>
            ) : (
              warehouseBreakdown.map((item) => {
                const percentage = Math.round((item.weight / maxWarehouseWeight) * 100);
                return (
                  <div key={item.name} className="space-y-1 text-xs">
                    <div className="flex justify-between font-medium text-neutral-800">
                      <span>{item.name}</span>
                      <span className="tabular-nums font-semibold text-neutral-950">
                        {item.tons} tons <span className="text-neutral-400 font-normal">({item.weight.toLocaleString()} kg)</span>
                      </span>
                    </div>
                    {/* SVG Progress Bar */}
                    <svg className="w-full h-3 rounded-full overflow-hidden bg-neutral-100" role="img" aria-label={`${item.name} stock: ${item.tons} tons`}>
                      <rect
                        x="0"
                        y="0"
                        width={`${Math.max(percentage, 4)}%`}
                        height="100%"
                        className="fill-neutral-900 transition-all duration-500"
                      />
                    </svg>
                  </div>
                );
              })
            )}
          </div>
        </Surface>

        {/* Chart 2: Order Status Distribution (SVG Donut Chart) */}
        <Surface className="p-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950">Purchase Order Lifecycle Status</h3>
              <p className="text-xs text-neutral-500">Distribution across active PO stages</p>
            </div>
            <Link href="/purchases" className="text-xs font-medium text-blue-600 hover:text-blue-800">
              Manage orders →
            </Link>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row items-center justify-around gap-6">
            {/* SVG Donut Graphic */}
            <div className="relative flex items-center justify-center">
              <svg className="h-40 w-40 -rotate-90 transform" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" className="stroke-neutral-100" strokeWidth="12" fill="none" />
                {/* Pending Arc */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  className="stroke-amber-500"
                  strokeWidth="12"
                  strokeDasharray={`${Math.max((pendingOrders.length / Math.max(state.orders.length, 1)) * 238, 4)} 238`}
                  strokeDashoffset="0"
                  fill="none"
                />
                {/* Approved Arc */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  className="stroke-emerald-600"
                  strokeWidth="12"
                  strokeDasharray={`${Math.max((approvedOrders.length / Math.max(state.orders.length, 1)) * 238, 4)} 238`}
                  strokeDashoffset={`-${(pendingOrders.length / Math.max(state.orders.length, 1)) * 238}`}
                  fill="none"
                />
                {/* Completed Arc */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  className="stroke-neutral-900"
                  strokeWidth="12"
                  strokeDasharray={`${Math.max((completedOrders.length / Math.max(state.orders.length, 1)) * 238, 4)} 238`}
                  strokeDashoffset={`-${((pendingOrders.length + approvedOrders.length) / Math.max(state.orders.length, 1)) * 238}`}
                  fill="none"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-2xl font-bold tracking-tight text-neutral-950">{state.orders.length}</span>
                <span className="block text-[10px] text-neutral-500 uppercase">Orders</span>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-3 text-xs w-full sm:w-auto">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-neutral-700">Pending Review</span>
                </div>
                <span className="font-semibold text-neutral-950 tabular-nums">{pendingOrders.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-emerald-600 shrink-0" />
                  <span className="text-neutral-700">Approved & Active</span>
                </div>
                <span className="font-semibold text-neutral-950 tabular-nums">{approvedOrders.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-neutral-900 shrink-0" />
                  <span className="text-neutral-700">Completed Operations</span>
                </div>
                <span className="font-semibold text-neutral-950 tabular-nums">{completedOrders.length}</span>
              </div>
            </div>
          </div>
        </Surface>
      </div>

      {/* Charts Section: Row 2 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chart 3: Offer Pipeline Funnel */}
        <Surface className="p-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950">Offer Pipeline Funnel</h3>
              <p className="text-xs text-neutral-500">Commercial negotiation & deal progression</p>
            </div>
            <Link href="/offers" className="text-xs font-medium text-blue-600 hover:text-blue-800">
              View offers →
            </Link>
          </div>

          <div className="mt-4 space-y-3 text-xs">
            {[
              {
                stage: "Drafted Offers",
                count: totalOffers.filter((o) => o.statusKey === "draft").length,
                color: "bg-neutral-300",
              },
              {
                stage: "Under Admin Review",
                count: totalOffers.filter((o) => o.statusKey === "under_review").length,
                color: "bg-blue-400",
              },
              {
                stage: "Approved by Admin",
                count: totalOffers.filter((o) => o.approvalStatus === "approved").length,
                color: "bg-indigo-500",
              },
              {
                stage: "Active Negotiation",
                count: totalOffers.filter((o) => o.statusKey === "negotiating").length,
                color: "bg-amber-500",
              },
              {
                stage: "Deals Won",
                count: wonOffers.length,
                color: "bg-emerald-600",
              },
            ].map((step) => {
              const maxOffers = Math.max(totalOffers.length, 1);
              const pct = Math.max(Math.round((step.count / maxOffers) * 100), 4);
              return (
                <div key={step.stage} className="space-y-1">
                  <div className="flex justify-between text-neutral-700">
                    <span>{step.stage}</span>
                    <span className="font-semibold text-neutral-950 tabular-nums">{step.count}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                    <div className={`h-full rounded-full ${step.color} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Surface>

        {/* Chart 4: Demurrage Risk by Shipping Carrier */}
        <Surface className="p-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950">Accrued Demurrage by Carrier</h3>
              <p className="text-xs text-neutral-500">Carrier port detention expenses and demurrage liability</p>
            </div>
            <span className="text-xs font-semibold text-red-600">
              Total: €{totalDemurrageEur.toLocaleString()}
            </span>
          </div>

          <div className="mt-4 space-y-3 text-xs">
            {carrierDemurrage.length === 0 || totalDemurrageEur === 0 ? (
              <div className="py-6 text-center text-xs text-neutral-500">
                <span className="text-emerald-600 font-medium">✓ Zero demurrage liability</span> — all containers within free-days window.
              </div>
            ) : (
              carrierDemurrage.map((item) => {
                const pct = Math.max(Math.round((item.cost / Math.max(totalDemurrageEur, 1)) * 100), 6);
                return (
                  <div key={item.carrier} className="space-y-1">
                    <div className="flex justify-between text-neutral-700">
                      <span className="font-medium text-neutral-800">{item.carrier}</span>
                      <span className="font-semibold text-red-700 tabular-nums">€{item.cost.toLocaleString()}</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                      <div className="h-full rounded-full bg-red-600 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}
