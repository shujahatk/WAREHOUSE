"use client";

import { useState } from "react";
import { BackLink, PageTitle, Surface } from "@/components/ref/chrome";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { canOpenPoThread } from "@/domain/view";

export function PoThread({ po }: { po: string }) {
  const { state, messagePo, notice } = useDemo();
  const { identity } = useSession();
  const [draft, setDraft] = useState("");
  const actor = { name: identity.name, role: identity.role, warehouse: identity.warehouse, email: identity.email, company: identity.company };
  const order = state.orders.find((item) => item.number.trim().toLowerCase() === po.trim().toLowerCase());
  const allowed = Boolean(order && canOpenPoThread(actor, order));
  const conversation = allowed
    ? state.conversations.find((item) => item.scope === "purchase-order" && item.po.trim().toLowerCase() === order?.number.trim().toLowerCase())
    : undefined;

  if (!allowed || !order) {
    return (
      <>
        <BackLink href="/chat" label="Chat" />
        <Surface className="p-6">
          <h1 className="text-lg font-semibold">You cannot open this conversation</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">Changing the purchase order in the address does not add you to the thread.</p>
        </Surface>
      </>
    );
  }

  return (
    <>
      <BackLink href="/purchases" label="Purchase Orders" />
      <PageTitle title={order.number} subtitle={`${order.customerCompany || order.supplier} · purchase order conversation`} />
      <p className="mb-3 text-xs leading-5 text-neutral-500">This thread stays with the purchase order. Supplier messages are recorded separately and are not emailed. Messages stay in this browser session.</p>
      {notice ? <p className="mb-3 text-sm text-neutral-700">{notice}</p> : null}
      <Surface className="flex min-h-[420px] flex-col">
        <ul className="flex-1 space-y-3 p-4">
          {conversation && conversation.messages.length > 0 ? (
            conversation.messages.map((item) => (
              <li key={item.id}>
                <p className="text-xs text-neutral-500">
                  {order.number} · {item.author} · {item.role} · {item.time}
                </p>
                <p className="mt-1 rounded-xl bg-neutral-100 px-3 py-2 text-sm">{item.text}</p>
              </li>
            ))
          ) : (
            <li className="text-sm leading-6 text-neutral-600">No messages on {order.number} yet. The first message stays in this browser session and is not emailed.</li>
          )}
        </ul>
        <form
          className="flex flex-col gap-2 border-t border-neutral-200 p-3 sm:flex-row"
          onSubmit={(event) => void (async () => {
            event.preventDefault();
            const error = await messagePo(order.number, draft);
            if (!error) setDraft("");
          })()}
        >
          <label className="sr-only" htmlFor="po-chat-draft">
            Message about {order.number}
          </label>
          <input
            id="po-chat-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Message about ${order.number}`}
            className="h-11 min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 text-sm"
          />
          <button type="submit" className="h-11 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white">
            Send
          </button>
        </form>
      </Surface>
    </>
  );
}
