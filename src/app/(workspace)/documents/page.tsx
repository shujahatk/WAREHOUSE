"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { AnnexDesk } from "@/components/ref/annex-desk";
import { PageTitle, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { useWorkspaceSearch } from "@/components/shell/search-context";
import { visibleDocuments, type DemoDocument } from "@/domain/view";
import { canPerform } from "@/lib/permissions";
import { UploadCapture } from "@/components/files/upload-capture";
import { AttachmentPreviewModal, type PreviewAttachmentItem } from "@/components/files/attachment-preview-modal";

const categories = ["All", "Purchase", "Container", "Transport"] as const;

export default function DocumentsPage() {
  const { state, notice } = useDemo();
  const { identity } = useSession();
  const query = useWorkspaceSearch().trim().toLowerCase();
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<PreviewAttachmentItem | null>(null);
  const [uploadCategory, setUploadCategory] = useState<DemoDocument["category"]>("Purchase");
  const canAdd = canPerform(identity.role, "add-document");
  const actor = { name: identity.name, role: identity.role, warehouse: identity.warehouse, email: identity.email, company: identity.company };
  const catalog = visibleDocuments(state, actor).filter((item) => item.origin !== "annex7");
  const rows = catalog.filter((item) => {
    const matchesCategory = category === "All" || item.category === category;
    return matchesCategory && `${item.name} ${item.meta}`.toLowerCase().includes(query);
  });
  const current = catalog.find((item) => item.id === selected) ?? null;

  return (
    <>
      <PageTitle
        title="Documents"
        subtitle="Operational documents, CMR files, and Annex VII records."
      />
      {notice ? <p className="mb-3 text-sm text-neutral-700">{notice}</p> : null}
      {canAdd ? (
        <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="text-xs text-neutral-500">
              Category
              <select
                value={uploadCategory}
                onChange={(event) => setUploadCategory(event.target.value as DemoDocument["category"])}
                className="mt-1 block h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
              >
                {categories.slice(1).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <UploadCapture
            kind="other"
            acceptPdf={true}
            multiple={true}
            label="Upload or capture document"
            helperText="Take photo or choose file (PDF or image). Uploads immediately."
          />
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((item) => (
          <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-full px-3 py-1 text-xs ${category === item ? "bg-neutral-950 text-white" : "border border-neutral-300 bg-white"}`}>
            {item}
          </button>
        ))}
        <span className="self-center text-xs text-neutral-500">
          {rows.length} of {catalog.length}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <ul className="space-y-2">
          {rows.length === 0 ? <li className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-sm text-neutral-600">No matching documents.</li> : null}
          {rows.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => setSelected(item.id)} className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left">
                <p className="text-sm font-medium">{item.name}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {item.category} · {item.meta}
                </p>
              </button>
            </li>
          ))}
        </ul>
        <Surface className="p-4">
          {current ? (
            <>
              <p className="text-xs text-neutral-500">{current.category}</p>
              <h2 className="mt-1 text-sm font-semibold">{current.name}</h2>
              <p className="mt-2 text-sm text-neutral-600">{current.meta}</p>
              {current.url ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewItem({
                        id: current.id,
                        name: current.name,
                        mime: current.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg",
                        url: current.url,
                        category: current.category,
                      })
                    }
                    className="inline-flex h-9 items-center rounded-lg bg-neutral-950 px-3.5 text-xs font-semibold text-white hover:bg-neutral-800 transition"
                  >
                    👁 Preview Document
                  </button>
                  <a
                    href={current.url}
                    download={current.name}
                    className="inline-flex h-9 items-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition"
                  >
                    Download
                  </a>
                </div>
              ) : (
                <p className="mt-3 text-xs text-neutral-500">No file download available for this entry.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-600">Select a document to view its details.</p>
          )}
        </Surface>
      </div>
      <div className="mt-4">
        <AnnexDesk />
      </div>
      <AttachmentPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
    </>
  );
}
