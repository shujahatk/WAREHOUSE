"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, Surface } from "@/components/ref/chrome";
import { listPublicUsers } from "@/domain/view";
import { ACTIVE_ROLES, roleLabel, type ActiveRole, type Role } from "@/lib/permissions";

const roles: readonly ActiveRole[] = ACTIVE_ROLES;

export default function UsersPage() {
  const { state, addUser, changeRole, notice } = useDemo();
  const users = listPublicUsers(state);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("worker");
  const [warehouse, setWarehouse] = useState("Bornem");

  return (
    <>
      <PageTitle title="Users" subtitle="User directory. Role-based access control." />
      {notice ? <p className="mb-3 text-sm text-neutral-700">{notice}</p> : null}
      <Surface className="mb-4 p-4">
        <h2 className="text-sm font-semibold">Add user</h2>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            void (async () => {
            event.preventDefault();
            const error = await addUser({ name, email, role, warehouse: role === "worker" ? warehouse : null, company: null });
            if (!error) {
              setName("");
              setEmail("");
            }
            })();
          }}
        >
          <label className="text-xs text-neutral-500">
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
          </label>
          <label className="text-xs text-neutral-500">
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
          </label>
          <label className="text-xs text-neutral-500">
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm">
              {roles.map((item) => (
                <option key={item} value={item}>
                  {roleLabel(item)}
                </option>
              ))}
            </select>
          </label>
          {role === "worker" ? (
            <label className="text-xs text-neutral-500">
              Warehouse
              <select value={warehouse} onChange={(event) => setWarehouse(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm">
                {["Bornem", "Turnhout", "Spain", "Pakistan"].map((site) => (
                  <option key={site}>{site}</option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="submit" className="h-10 rounded-lg bg-neutral-950 px-3 text-sm font-medium text-white sm:col-span-2 sm:justify-self-start">
            Add user
          </button>
        </form>
      </Surface>
      <ul className="space-y-2">
        {users.map((person) => (
          <li key={person.email}>
            <Surface className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{person.name}</p>
                <p className="text-xs text-neutral-500">
                  {person.email} · {person.status}
                  {person.warehouse ? ` · ${person.warehouse}` : ""}
                  {person.company ? ` · ${person.company}` : ""}
                </p>
              </div>
              <label className="text-xs text-neutral-500">
                Role
                <select
                  value={person.role}
                  onChange={(event) => {
                    const next = event.target.value as Role;
                    changeRole(person.email, next, person.warehouse ?? "Bornem", null);
                  }}
                  className="mt-1 h-9 rounded-lg border border-neutral-300 px-2 text-sm"
                >
                  {roles.map((item) => (
                    <option key={item} value={item}>
                      {roleLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            </Surface>
          </li>
        ))}
      </ul>
    </>
  );
}
