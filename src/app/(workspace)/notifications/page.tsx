"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, Surface, StatusPill } from "@/components/ref/chrome";
import { Icon } from "@/components/icons";
import { formatInstant, type DemoNotification } from "@/domain/view";

type CategoryFilter = "all" | "unread" | "orders" | "inventory" | "requests" | "offers" | "demurrage";

export default function NotificationsPage() {
  const { state, markNotificationRead, markAllNotificationsRead, refresh, isSyncing } = useDemo();
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [prefsOpen, setPrefsOpen] = useState(false);

  // Preference subscriptions in component state
  const [notifyOrders, setNotifyOrders] = useState(true);
  const [notifyInventory, setNotifyInventory] = useState(true);
  const [notifyRequests, setNotifyRequests] = useState(true);
  const [notifyOffers, setNotifyOffers] = useState(true);
  const [notifyDemurrage, setNotifyDemurrage] = useState(true);

  const notifications = useMemo(() => state.notifications || [], [state.notifications]);

  // Compute category counts
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const ordersCount = useMemo(
    () => notifications.filter((n) => n.eventType.includes("order") || n.targetType === "purchase_order").length,
    [notifications],
  );
  const inventoryCount = useMemo(
    () => notifications.filter((n) => n.eventType.includes("stock") || n.targetType === "material").length,
    [notifications],
  );
  const requestsCount = useMemo(
    () => notifications.filter((n) => n.eventType.includes("request") || n.targetType === "request").length,
    [notifications],
  );
  const offersCount = useMemo(
    () => notifications.filter((n) => n.eventType.includes("offer") || n.targetType === "offer").length,
    [notifications],
  );
  const demurrageCount = useMemo(
    () => notifications.filter((n) => n.eventType.includes("demurrage") || n.targetType === "shipment").length,
    [notifications],
  );

  // Filtered notifications
  const filtered = useMemo(() => {
    switch (filter) {
      case "unread":
        return notifications.filter((n) => !n.read);
      case "orders":
        return notifications.filter((n) => n.eventType.includes("order") || n.targetType === "purchase_order");
      case "inventory":
        return notifications.filter((n) => n.eventType.includes("stock") || n.targetType === "material");
      case "requests":
        return notifications.filter((n) => n.eventType.includes("request") || n.targetType === "request");
      case "offers":
        return notifications.filter((n) => n.eventType.includes("offer") || n.targetType === "offer");
      case "demurrage":
        return notifications.filter((n) => n.eventType.includes("demurrage") || n.targetType === "shipment");
      case "all":
      default:
        return notifications;
    }
  }, [notifications, filter]);

  const getEventBadge = (n: DemoNotification) => {
    if (n.eventType.includes("order")) return <StatusPill label="Pending" />;
    if (n.eventType.includes("stock") || n.eventType.includes("inventory")) return <StatusPill label="Warning" />;
    if (n.eventType.includes("request")) return <StatusPill label="Registered" />;
    if (n.eventType.includes("offer")) return <StatusPill label="Planned" />;
    if (n.eventType.includes("demurrage")) return <StatusPill label="Rejected" />;
    return <StatusPill label="Planned" />;
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          title="Notification Centre"
          subtitle="Real-time alerts, operational updates, approval requests, and inventory thresholds."
        />
        <div className="flex items-center gap-2">
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => markAllNotificationsRead()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
            >
              Mark all as read
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => refresh()}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            <Icon name="reports" className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setPrefsOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
          >
            <Icon name="settings" className="h-3.5 w-3.5" />
            Preferences
          </button>
        </div>
      </div>

      {/* Notification Preferences Drawer / Card */}
      {prefsOpen ? (
        <Surface className="p-4 bg-neutral-50/70 border border-neutral-200">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
            <h3 className="text-xs font-semibold text-neutral-900 uppercase tracking-wide">
              Notification Subscriptions
            </h3>
            <button
              type="button"
              onClick={() => setPrefsOpen(false)}
              className="text-xs text-neutral-400 hover:text-neutral-700"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOrders}
                onChange={(e) => setNotifyOrders(e.target.checked)}
                className="rounded border-neutral-300 text-neutral-900"
              />
              <span>PO & SO Order Status Updates</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyInventory}
                onChange={(e) => setNotifyInventory(e.target.checked)}
                className="rounded border-neutral-300 text-neutral-900"
              />
              <span>Low Stock & Reorder Thresholds</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyRequests}
                onChange={(e) => setNotifyRequests(e.target.checked)}
                className="rounded border-neutral-300 text-neutral-900"
              />
              <span>Loading / Unloading Requests</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOffers}
                onChange={(e) => setNotifyOffers(e.target.checked)}
                className="rounded border-neutral-300 text-neutral-900"
              />
              <span>Offer Negotiations & Review</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyDemurrage}
                onChange={(e) => setNotifyDemurrage(e.target.checked)}
                className="rounded border-neutral-300 text-neutral-900"
              />
              <span>Demurrage & Port Detention Warnings</span>
            </label>
          </div>
        </Surface>
      ) : null}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-200 pb-2 text-xs">
        {[
          { id: "all", label: "All", count: notifications.length },
          { id: "unread", label: "Unread", count: unreadCount },
          { id: "orders", label: "Orders", count: ordersCount },
          { id: "inventory", label: "Inventory", count: inventoryCount },
          { id: "requests", label: "Requests", count: requestsCount },
          { id: "offers", label: "Offers", count: offersCount },
          { id: "demurrage", label: "Demurrage", count: demurrageCount },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id as CategoryFilter)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
              filter === tab.id
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200"
            }`}
          >
            {tab.label}
            {tab.count > 0 ? (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  filter === tab.id ? "bg-neutral-700 text-white" : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <Surface className="divide-y divide-neutral-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <Icon name="bell" className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-medium text-neutral-900">No notifications found</p>
            <p className="mt-1 text-xs text-neutral-500">
              {filter === "unread" ? "You have read all your notifications!" : "There are no notifications in this category."}
            </p>
          </div>
        ) : (
          filtered.map((notif) => (
            <div
              key={notif.id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 transition-colors hover:bg-neutral-50/70 ${
                !notif.read ? "bg-blue-50/25" : ""
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 shrink-0">
                  {!notif.read ? (
                    <span className="block h-2 w-2 rounded-full bg-blue-600 ring-4 ring-blue-100" />
                  ) : (
                    <span className="block h-2 w-2 rounded-full bg-neutral-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {getEventBadge(notif)}
                    <h4 className="text-sm font-semibold text-neutral-950">{notif.title}</h4>
                    {notif.warehouse ? (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                        {notif.warehouse}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-neutral-700">{notif.message}</p>
                  <p className="mt-1 text-[11px] text-neutral-400 tabular-nums">
                    {formatInstant(notif.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {notif.link ? (
                  <Link
                    href={notif.link}
                    onClick={() => {
                      if (!notif.read) markNotificationRead(notif.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
                  >
                    Go to record →
                  </Link>
                ) : null}
                {!notif.read ? (
                  <button
                    type="button"
                    onClick={() => markNotificationRead(notif.id)}
                    className="rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                  >
                    Mark as read
                  </button>
                ) : (
                  <span className="text-[11px] text-neutral-400">Read</span>
                )}
              </div>
            </div>
          ))
        )}
      </Surface>
    </>
  );
}
