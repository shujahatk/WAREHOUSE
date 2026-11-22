"use client";

import { useEffect, useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { Icon } from "@/components/icons";
import { PageTitle, Surface } from "@/components/ref/chrome";
import { listPublicUsers, type PublicUser } from "@/domain/view";
import { roleLabel, type Role } from "@/lib/permissions";
import { cn } from "@/lib/cn";

const WAREHOUSE_OPTIONS = ["Bornem", "Turnhout", "Spain", "Pakistan"] as const;

export default function UsersPage() {
  const {
    state,
    actor,
    addUser,
    changeRole,
    deactivateUser,
    reactivateUser,
    deleteUser,
    approveRegistration,
    rejectRegistration,
    deleteRegistrationRequest,
    refresh,
    notice,
  } = useDemo();

  // Periodic polling so new signups appear automatically
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, 12000);
    return () => clearInterval(timer);
  }, [refresh]);

  const allUsers = listPublicUsers(state);

  const pendingRequests = useMemo(
    () => allUsers.filter((u) => u.approvalStatus === "pending"),
    [allUsers],
  );

  const approvedRequests = useMemo(
    () => allUsers.filter((u) => u.approvalStatus === "approved" && (Boolean(u.registrationNotes) || u.role === "offers_user")),
    [allUsers],
  );

  const rejectedRequests = useMemo(
    () => allUsers.filter((u) => u.approvalStatus === "rejected"),
    [allUsers],
  );

  const [requestFilter, setRequestFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  const displayedRequests = useMemo(() => {
    if (requestFilter === "pending") return pendingRequests;
    if (requestFilter === "approved") return approvedRequests;
    if (requestFilter === "rejected") return rejectedRequests;
    return allUsers.filter(
      (u) => u.approvalStatus === "pending" || u.approvalStatus === "rejected" || Boolean(u.registrationNotes) || u.role === "offers_user"
    );
  }, [requestFilter, pendingRequests, approvedRequests, rejectedRequests, allUsers]);

  const activeUsers = useMemo(
    () => allUsers.filter((u) => u.approvalStatus !== "pending"),
    [allUsers],
  );

  // Active tab: "users" or "requests"
  const [activeTab, setActiveTab] = useState<"users" | "requests">(
    pendingRequests.length > 0 ? "requests" : "users",
  );

  // Filters & Search for Users tab
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modals state
  const [selectedUser, setSelectedUser] = useState<PublicUser | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [approveModalUser, setApproveModalUser] = useState<PublicUser | null>(null);
  const [rejectModalUser, setRejectModalUser] = useState<PublicUser | null>(null);
  const [roleEditUser, setRoleEditUser] = useState<PublicUser | null>(null);
  const [deleteModalUser, setDeleteModalUser] = useState<PublicUser | null>(null);
  const [isDeletePendingRequest, setIsDeletePendingRequest] = useState(false);
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);

  // Form states for modals
  const [assignedRole, setAssignedRole] = useState<Role>("worker");
  const [assignedWarehouse, setAssignedWarehouse] = useState<string>("Bornem");
  const [actionNotes, setActionNotes] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Add User Form
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserRole, setNewUserRole] = useState<Role>("worker");
  const [newUserWarehouse, setNewUserWarehouse] = useState<string>("Bornem");

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return allUsers.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesName = u.name.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesPhone = u.phone?.toLowerCase().includes(q) ?? false;
        const matchesRole = roleLabel(u.role).toLowerCase().includes(q);
        const matchesWarehouse = u.warehouse?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesRole && !matchesWarehouse) {
          return false;
        }
      }
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "active" && (u.status !== "Active" || u.approvalStatus === "pending")) return false;
        if (statusFilter === "inactive" && (u.status !== "Inactive" || u.approvalStatus === "pending")) return false;
        if (statusFilter === "pending" && u.approvalStatus !== "pending") return false;
        if (statusFilter === "rejected" && u.approvalStatus !== "rejected") return false;
      }
      return true;
    });
  }, [allUsers, search, roleFilter, statusFilter]);

  // Handle Approve
  async function handleApprove() {
    if (!approveModalUser) return;
    setActionPending(true);
    setActionError(null);
    try {
      const err = await approveRegistration({
        userId: approveModalUser.id || approveModalUser.email,
        role: assignedRole,
        warehouse: assignedRole === "worker" ? assignedWarehouse : null,
        notes: actionNotes.trim() || undefined,
      });
      if (err) {
        setActionError(err);
      } else {
        setApproveModalUser(null);
        setActionNotes("");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Approval failed.");
    } finally {
      setActionPending(false);
    }
  }

  // Handle Reject
  async function handleReject() {
    if (!rejectModalUser) return;
    const reason = actionNotes.trim();
    if (!reason) {
      setActionError("A rejection reason is mandatory.");
      return;
    }
    setActionPending(true);
    setActionError(null);
    try {
      const err = await rejectRegistration({
        userId: rejectModalUser.id || rejectModalUser.email,
        reason,
      });
      if (err) {
        setActionError(err);
      } else {
        setRejectModalUser(null);
        setActionNotes("");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Rejection failed.");
    } finally {
      setActionPending(false);
    }
  }

  // Handle Delete
  async function handleDelete() {
    if (!deleteModalUser) return;
    setActionPending(true);
    setActionError(null);
    try {
      let err: string | null = null;
      if (isDeletePendingRequest) {
        err = (await deleteRegistrationRequest(deleteModalUser.id || deleteModalUser.email)) ?? null;
      } else {
        err = (await deleteUser(deleteModalUser.id || deleteModalUser.email)) ?? null;
      }
      if (err) {
        const lower = err.toLowerCase();
        if (lower.includes("permission denied") || lower.includes("42501") || lower.includes("removed") || lower.includes("deleted")) {
          setDeleteModalUser(null);
        } else {
          setActionError(err);
        }
      } else {
        setDeleteModalUser(null);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Deletion failed.");
    } finally {
      setActionPending(false);
    }
  }

  // Handle Role Change
  async function handleRoleChange() {
    if (!roleEditUser) return;
    setActionPending(true);
    setActionError(null);
    try {
      const err = await changeRole(
        roleEditUser.email,
        assignedRole,
        assignedRole === "worker" ? assignedWarehouse : null,
        null,
      );
      if (err) {
        setActionError(err);
      } else {
        setRoleEditUser(null);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Role update failed.");
    } finally {
      setActionPending(false);
    }
  }

  // Handle Add User
  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setActionPending(true);
    setActionError(null);
    try {
      const err = await addUser({
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        role: newUserRole,
        warehouse: newUserRole === "worker" ? newUserWarehouse : null,
        company: null,
      });
      if (err) {
        setActionError(err);
      } else {
        setAddUserModalOpen(false);
        setNewUserName("");
        setNewUserEmail("");
        setNewUserPhone("");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to add user.");
    } finally {
      setActionPending(false);
    }
  }

  const activeCount = allUsers.filter((u) => u.status === "Active" && u.approvalStatus !== "pending").length;
  const pendingCount = pendingRequests.length;
  const inactiveCount = allUsers.filter((u) => u.status === "Inactive" || u.approvalStatus === "rejected").length;

  if (actor && actor.role !== "owner") {
    return (
      <section className="mx-auto mt-8 max-w-lg rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-xs">
        <h1 className="text-xl font-semibold text-neutral-950">Access Denied</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Only administrators have permission to view and manage user accounts and login/registration requests.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle
          title="Users & Access Control"
          subtitle="Manage enterprise accounts, roles, permissions, and signup approval requests."
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 transition"
          >
            <Icon name="refresh" className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setAddUserModalOpen(true);
            }}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white shadow-2xs hover:bg-neutral-800 transition"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            Add User
          </button>
        </div>
      </div>

      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}

      {/* KPI Stats Cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Surface className="p-4">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Total Accounts</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">{allUsers.length}</p>
          <p className="mt-0.5 text-xs text-neutral-400">All registered identities</p>
        </Surface>

        <Surface className="p-4">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Active Users</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-emerald-700">{activeCount}</p>
          <p className="mt-0.5 text-xs text-neutral-400">Authorized &amp; operational</p>
        </Surface>

        <Surface
          className={cn(
            "p-4 transition cursor-pointer hover:border-amber-400",
            pendingCount > 0 ? "border-amber-300 bg-amber-50/40" : "",
          )}
          onClick={() => setActiveTab("requests")}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider">Pending Requests</p>
            {pendingCount > 0 ? (
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping" />
            ) : null}
          </div>
          <p className="mt-1 text-2xl font-bold tracking-tight text-amber-700">{pendingCount}</p>
          <p className="mt-0.5 text-xs text-amber-800/80">
            {pendingCount > 0 ? "Requires Admin review" : "No pending applicants"}
          </p>
        </Surface>

        <Surface className="p-4">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Inactive / Rejected</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-neutral-700">{inactiveCount}</p>
          <p className="mt-0.5 text-xs text-neutral-400">Access disabled</p>
        </Surface>
      </div>

      {/* Tab Switcher */}
      <div className="mt-6 flex border-b border-neutral-200">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition",
            activeTab === "users"
              ? "border-emerald-700 text-emerald-950 font-bold"
              : "border-transparent text-neutral-500 hover:text-neutral-800",
          )}
        >
          All Users
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
            {activeUsers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition",
            activeTab === "requests"
              ? "border-emerald-700 text-emerald-950 font-bold"
              : "border-transparent text-neutral-500 hover:text-neutral-800",
          )}
        >
          Registration Requests
          {pendingCount > 0 ? (
            <span className="flex h-5 items-center rounded-full bg-amber-500/20 px-2 text-xs font-bold text-amber-800 border border-amber-400/40">
              {pendingCount}
            </span>
          ) : (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">0</span>
          )}
        </button>
      </div>

      {/* TAB 1: REGISTRATION REQUESTS */}
      {activeTab === "requests" ? (
        <div className="mt-4 space-y-4">
          {/* Sub-Filters: Pending / Approved / Rejected / All */}
          <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-3">
            <button
              type="button"
              onClick={() => setRequestFilter("pending")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                requestFilter === "pending"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
              )}
            >
              Pending Approval ({pendingRequests.length})
            </button>
            <button
              type="button"
              onClick={() => setRequestFilter("approved")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                requestFilter === "approved"
                  ? "bg-emerald-700 text-white shadow-2xs"
                  : "bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
              )}
            >
              Previously Approved ({approvedRequests.length})
            </button>
            <button
              type="button"
              onClick={() => setRequestFilter("rejected")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                requestFilter === "rejected"
                  ? "bg-rose-700 text-white shadow-2xs"
                  : "bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
              )}
            >
              Rejected ({rejectedRequests.length})
            </button>
            <button
              type="button"
              onClick={() => setRequestFilter("all")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                requestFilter === "all"
                  ? "bg-neutral-900 text-white shadow-2xs"
                  : "bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
              )}
            >
              All Requests ({allUsers.filter((u) => u.approvalStatus === "pending" || u.approvalStatus === "rejected" || Boolean(u.registrationNotes) || u.role === "offers_user").length})
            </button>
          </div>

          {displayedRequests.length === 0 ? (
            <Surface className="p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <Icon name="check" className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-neutral-900">No Applications in this View</h3>
              <p className="mt-1 text-sm text-neutral-500 max-w-sm mx-auto">
                {requestFilter === "pending"
                  ? "There are currently no pending applicants awaiting review."
                  : `No ${requestFilter} registration records found.`}
              </p>
            </Surface>
          ) : (
            <div className="space-y-3">
              {requestFilter === "pending" && pendingRequests.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between">
                  <span>
                    <strong>{pendingRequests.length} pending applicant{pendingRequests.length > 1 ? "s" : ""}</strong> awaiting approval. Signing up does not grant system access until approved by an administrator.
                  </span>
                  <span className="text-[11px] text-amber-700 font-medium">Auto-refreshes every 12s</span>
                </div>
              ) : null}

              <div className="grid gap-3">
                {displayedRequests.map((applicant) => (
                  <Surface
                    key={applicant.id || applicant.email}
                    className={cn(
                      "p-4 bg-white shadow-xs transition",
                      applicant.approvalStatus === "pending"
                        ? "border-amber-200 hover:border-amber-300"
                        : applicant.approvalStatus === "rejected"
                          ? "border-rose-200 hover:border-rose-300 bg-rose-50/20"
                          : "border-neutral-200 hover:border-emerald-300"
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-neutral-950">{applicant.name}</h3>
                          {applicant.approvalStatus === "pending" ? (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase tracking-wide">
                              Pending Approval
                            </span>
                          ) : applicant.approvalStatus === "rejected" ? (
                            <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 uppercase tracking-wide">
                              ✕ Rejected
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                              ✓ Approved ({roleLabel(applicant.role)})
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-neutral-600">
                          <span className="font-medium text-neutral-900">{applicant.email}</span>
                          {applicant.phone ? (
                            <span> &bull; Tel: <span className="font-medium text-neutral-900">{applicant.phone}</span></span>
                          ) : null}
                          {applicant.company ? (
                            <span> &bull; Company: <span className="font-medium text-neutral-900">{applicant.company}</span></span>
                          ) : null}
                        </p>
                        {applicant.registrationNotes ? (
                          <div className={cn(
                            "mt-2 rounded-lg border p-2.5 text-xs",
                            applicant.approvalStatus === "rejected"
                              ? "bg-rose-50/80 border-rose-200 text-rose-900"
                              : "bg-neutral-50 border-neutral-200 text-neutral-700"
                          )}>
                            <span className="font-semibold text-neutral-900">
                              {applicant.approvalStatus === "rejected" ? "Rejection Reason: " : "Applicant Note: "}
                            </span>
                            &ldquo;{applicant.registrationNotes}&rdquo;
                          </div>
                        ) : null}
                        {applicant.createdAt ? (
                          <p className="mt-2 text-[11px] text-neutral-400">
                            Registered on {new Date(applicant.createdAt).toLocaleString()}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUser(applicant);
                            setDetailsModalOpen(true);
                          }}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-neutral-300 bg-white px-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                        >
                          View Details
                        </button>
                        {applicant.approvalStatus === "pending" || applicant.approvalStatus === "rejected" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setApproveModalUser(applicant);
                              setAssignedRole(applicant.role === "offers_user" ? "offers_user" : "worker");
                              setAssignedWarehouse(applicant.warehouse || "Bornem");
                              setActionNotes("");
                              setActionError(null);
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-800 transition"
                          >
                            Approve &amp; Assign Role
                          </button>
                        ) : null}
                        {applicant.approvalStatus === "pending" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setRejectModalUser(applicant);
                              setActionNotes("");
                              setActionError(null);
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-red-200 bg-red-50/50 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Reject
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteModalUser(applicant);
                            setIsDeletePendingRequest(applicant.approvalStatus === "pending");
                            setActionError(null);
                          }}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-500 hover:text-red-700 hover:bg-neutral-50"
                          title="Delete Request"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </Surface>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* TAB 2: ALL USERS DIRECTORY */}
      {activeTab === "users" ? (
        <div className="mt-4 space-y-4">
          {/* Search & Filters */}
          <Surface className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[240px] flex-1">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email, phone, role, warehouse..."
                  className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-8 pr-3 text-xs text-neutral-900 placeholder-neutral-400 focus:border-emerald-700 focus:outline-hidden"
                />
                <span className="absolute inset-y-0 left-2.5 flex items-center text-neutral-400">
                  <Icon name="inventory" className="h-3.5 w-3.5" />
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-800 focus:border-emerald-700 focus:outline-hidden"
                >
                  <option value="all">All Roles</option>
                  <option value="owner">Admin (Owner)</option>
                  <option value="manager">Staff (Manager)</option>
                  <option value="worker">Worker</option>
                  <option value="moderator">Offers Moderator</option>
                  <option value="offers_user">Offers User</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-800 focus:border-emerald-700 focus:outline-hidden"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive / Deactivated</option>
                  <option value="pending">Pending Approval</option>
                  <option value="rejected">Rejected</option>
                </select>

                {search || roleFilter !== "all" || statusFilter !== "all" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setRoleFilter("all");
                      setStatusFilter("all");
                    }}
                    className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 px-2 py-1"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
          </Surface>

          {/* Users Table */}
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-2xs">
            <table className="min-w-full divide-y divide-neutral-200 text-left text-xs">
              <thead className="bg-neutral-50 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Scope / Warehouse</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-normal text-neutral-800">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-500 text-xs">
                      No users match the current search or filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelf = actor?.email.toLowerCase() === user.email.toLowerCase();
                    const isPending = user.approvalStatus === "pending";
                    const isRejected = user.approvalStatus === "rejected";
                    const isActive = user.status === "Active" && !isPending && !isRejected;

                    return (
                      <tr key={user.id || user.email} className="hover:bg-neutral-50/80 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white font-bold text-xs uppercase">
                              {user.name.slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-semibold text-neutral-900 flex items-center gap-1.5">
                                {user.name}
                                {isSelf ? (
                                  <span className="rounded bg-neutral-200 px-1 py-0.2 text-[9px] font-semibold text-neutral-700">
                                    You
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-[11px] text-neutral-500">{user.email}</p>
                              {user.phone ? (
                                <p className="text-[10px] text-neutral-400">Tel: {user.phone}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                              user.role === "owner"
                                ? "bg-neutral-900 text-white"
                                : user.role === "manager"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : user.role === "worker"
                                    ? "bg-blue-100 text-blue-800"
                                    : user.role === "moderator"
                                      ? "bg-purple-100 text-purple-800"
                                      : "bg-teal-100 text-teal-800",
                            )}
                          >
                            {roleLabel(user.role)}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-neutral-600">
                          {user.warehouse ? (
                            <span className="font-medium text-neutral-900">{user.warehouse}</span>
                          ) : user.company ? (
                            <span>Company: {user.company}</span>
                          ) : (
                            <span className="text-neutral-400">Global / System-wide</span>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              isPending
                                ? "bg-amber-100 text-amber-800"
                                : isRejected
                                  ? "bg-rose-100 text-rose-800"
                                  : isActive
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-neutral-200 text-neutral-700",
                            )}
                          >
                            {isPending
                              ? "Pending Approval"
                              : isRejected
                                ? "Rejected"
                                : isActive
                                  ? "Active"
                                  : "Deactivated"}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Details */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUser(user);
                                setDetailsModalOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100"
                              title="View Details"
                            >
                              <Icon name="reports" className="h-4 w-4" />
                            </button>

                            {/* Edit Role Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setRoleEditUser(user);
                                setAssignedRole(user.role);
                                setAssignedWarehouse(user.warehouse || "Bornem");
                                setActionError(null);
                              }}
                              className="rounded-lg px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                            >
                              Edit Role
                            </button>

                            {/* Activate / Deactivate Toggle */}
                            {!isPending && !isRejected ? (
                              isActive ? (
                                <button
                                  type="button"
                                  disabled={isSelf}
                                  onClick={() => void deactivateUser(user.id || user.email)}
                                  className="rounded-lg px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-30"
                                  title={isSelf ? "Cannot deactivate yourself" : "Deactivate account"}
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void reactivateUser(user.id || user.email)}
                                  className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                >
                                  Reactivate
                                </button>
                              )
                            ) : null}

                            {/* Delete User */}
                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={() => {
                                setDeleteModalUser(user);
                                setIsDeletePendingRequest(isPending);
                                setActionError(null);
                              }}
                              className="rounded-lg p-1.5 text-neutral-400 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-30"
                              title={isSelf ? "Cannot delete yourself" : "Delete account"}
                            >
                              <Icon name="trash" className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* APPROVE REGISTRATION MODAL */}
      {approveModalUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Approve Account Registration</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Assign an operational role and warehouse scope for{" "}
              <strong className="text-neutral-900">{approveModalUser.name}</strong> ({approveModalUser.email}).
            </p>

            {actionError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                {actionError}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-neutral-700">
                Authorized Role
                <select
                  value={assignedRole}
                  onChange={(e) => setAssignedRole(e.target.value as Role)}
                  className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-emerald-700 focus:outline-hidden"
                >
                  <option value="worker">Worker (Warehouse Operations: Loading/Unloading)</option>
                  <option value="manager">Staff / Manager (PO/SO Orders &amp; Operations)</option>
                  <option value="moderator">Offers Moderator (Purchasing &amp; Selling)</option>
                  <option value="offers_user">Offers User (External Portal Access)</option>
                  <option value="owner">Administrator (Full System Control)</option>
                </select>
              </label>

              {assignedRole === "worker" ? (
                <label className="block text-xs font-medium text-neutral-700">
                  Assigned Warehouse
                  <select
                    value={assignedWarehouse}
                    onChange={(e) => setAssignedWarehouse(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-emerald-700 focus:outline-hidden"
                  >
                    {WAREHOUSE_OPTIONS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block text-xs font-medium text-neutral-700">
                Approval Note / Instructions (optional)
                <textarea
                  rows={2}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="e.g. Approved for Bornem shift"
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs focus:border-emerald-700 focus:outline-hidden"
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={actionPending}
                onClick={() => setApproveModalUser(null)}
                className="h-9 rounded-lg border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionPending}
                onClick={() => void handleApprove()}
                className="h-9 rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {actionPending ? "Approving…" : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* REJECT REGISTRATION MODAL */}
      {rejectModalUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Decline Registration</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Decline the signup application for{" "}
              <strong className="text-neutral-900">{rejectModalUser.name}</strong> ({rejectModalUser.email}).
            </p>

            {actionError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                {actionError}
              </div>
            ) : null}

            <div className="mt-4">
              <label className="block text-xs font-medium text-neutral-700">
                Reason for Rejection <span className="text-red-600 font-bold">* (Mandatory)</span>
                <textarea
                  rows={3}
                  required
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Enter a mandatory rejection reason for declining this request..."
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs focus:border-red-700 focus:outline-hidden"
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={actionPending}
                onClick={() => setRejectModalUser(null)}
                className="h-9 rounded-lg border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionPending}
                onClick={() => void handleReject()}
                className="h-9 rounded-lg bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {actionPending ? "Declining…" : "Decline Application"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* EDIT ROLE MODAL */}
      {roleEditUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Change User Role &amp; Scope</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Update authorized role for <strong className="text-neutral-900">{roleEditUser.name}</strong> ({roleEditUser.email}).
            </p>

            {actionError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                {actionError}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-neutral-700">
                Role
                <select
                  value={assignedRole}
                  onChange={(e) => setAssignedRole(e.target.value as Role)}
                  className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-emerald-700 focus:outline-hidden"
                >
                  <option value="worker">Worker (Warehouse Operations)</option>
                  <option value="manager">Staff (Orders &amp; Movements)</option>
                  <option value="moderator">Offers Moderator</option>
                  <option value="offers_user">Offers User</option>
                  <option value="owner">Administrator (Owner)</option>
                </select>
              </label>

              {assignedRole === "worker" ? (
                <label className="block text-xs font-medium text-neutral-700">
                  Assigned Warehouse
                  <select
                    value={assignedWarehouse}
                    onChange={(e) => setAssignedWarehouse(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-emerald-700 focus:outline-hidden"
                  >
                    {WAREHOUSE_OPTIONS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={actionPending}
                onClick={() => setRoleEditUser(null)}
                className="h-9 rounded-lg border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionPending}
                onClick={() => void handleRoleChange()}
                className="h-9 rounded-lg bg-neutral-950 px-4 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                {actionPending ? "Saving…" : "Save Role"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModalUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3 text-red-600">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <Icon name="trash" className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900">
                {isDeletePendingRequest ? "Delete Registration Request?" : "Delete User Account?"}
              </h3>
            </div>

            <p className="mt-3 text-sm text-neutral-600 leading-relaxed">
              Are you sure you want to delete the account for{" "}
              <strong className="text-neutral-900">{deleteModalUser.name}</strong> ({deleteModalUser.email})?
            </p>

            <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
              <p className="font-semibold text-neutral-900">Operational Integrity Guarantee:</p>
              <p className="mt-1">
                Authentication credentials will be immediately revoked. If this user performed operational actions (such as PO/SO creation or inventory movements), historical records and audit logs are strictly preserved.
              </p>
            </div>

            {actionError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                {actionError}
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={actionPending}
                onClick={() => setDeleteModalUser(null)}
                className="h-9 rounded-lg border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionPending}
                onClick={() => void handleDelete()}
                className="h-9 rounded-lg bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {actionPending ? "Deleting…" : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* USER DETAILS MODAL */}
      {detailsModalOpen && selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-neutral-900">{selectedUser.name}</h3>
                <p className="text-xs text-neutral-500">{selectedUser.email}</p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                  selectedUser.status === "Active"
                    ? "bg-emerald-100 text-emerald-800"
                    : selectedUser.approvalStatus === "pending"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-neutral-100 text-neutral-700",
                )}
              >
                {selectedUser.approvalStatus === "pending"
                  ? "Pending Approval"
                  : selectedUser.status}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 text-xs">
              <div className="rounded-lg bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500 block">Role</span>
                <span className="text-neutral-900 font-medium text-sm mt-0.5 block">
                  {roleLabel(selectedUser.role)}
                </span>
              </div>
              <div className="rounded-lg bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500 block">Assigned Warehouse</span>
                <span className="text-neutral-900 font-medium text-sm mt-0.5 block">
                  {selectedUser.warehouse || "None (Global)"}
                </span>
              </div>
              <div className="rounded-lg bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500 block">Phone</span>
                <span className="text-neutral-900 font-medium text-sm mt-0.5 block">
                  {selectedUser.phone || "Not recorded"}
                </span>
              </div>
              <div className="rounded-lg bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500 block">Company</span>
                <span className="text-neutral-900 font-medium text-sm mt-0.5 block">
                  {selectedUser.company || "None"}
                </span>
              </div>
            </div>

            {selectedUser.registrationNotes ? (
              <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-xs">
                <span className="font-semibold text-neutral-700 block mb-1">Registration Notes:</span>
                <p className="text-neutral-600 leading-relaxed">{selectedUser.registrationNotes}</p>
              </div>
            ) : null}

            {selectedUser.createdAt ? (
              <p className="mt-4 text-[11px] text-neutral-400">
                Created: {new Date(selectedUser.createdAt).toLocaleString()}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailsModalOpen(false)}
                className="h-9 rounded-lg bg-neutral-950 px-5 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ADD USER MODAL */}
      {addUserModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Add New Team Member</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Create a user directly with pre-approved access and credentials.
            </p>

            {actionError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                {actionError}
              </div>
            ) : null}

            <form onSubmit={(e) => void handleAddUser(e)} className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-neutral-700">
                Full Name
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-emerald-700 focus:outline-hidden"
                />
              </label>

              <label className="block text-xs font-medium text-neutral-700">
                Email Address
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-emerald-700 focus:outline-hidden"
                />
              </label>

              <label className="block text-xs font-medium text-neutral-700">
                Role
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as Role)}
                  className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-emerald-700 focus:outline-hidden"
                >
                  <option value="worker">Worker</option>
                  <option value="manager">Staff (Manager)</option>
                  <option value="moderator">Offers Moderator</option>
                  <option value="offers_user">Offers User</option>
                  <option value="owner">Administrator (Owner)</option>
                </select>
              </label>

              {newUserRole === "worker" ? (
                <label className="block text-xs font-medium text-neutral-700">
                  Assigned Warehouse
                  <select
                    value={newUserWarehouse}
                    onChange={(e) => setNewUserWarehouse(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-emerald-700 focus:outline-hidden"
                  >
                    {WAREHOUSE_OPTIONS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="mt-6 flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => setAddUserModalOpen(false)}
                  className="h-9 rounded-lg border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionPending}
                  className="h-9 rounded-lg bg-neutral-950 px-4 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                >
                  {actionPending ? "Creating…" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
