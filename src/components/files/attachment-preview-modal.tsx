"use client";

import { useEffect, useState } from "react";

export type PreviewAttachmentItem = {
  id?: string;
  name: string;
  mime: string;
  byteSize?: number;
  url: string | null;
  uploadedByName?: string | null;
  uploadedAt?: string | null;
  category?: string | null;
  warehouse?: string | null;
};

export type AttachmentPreviewModalProps = {
  item: PreviewAttachmentItem | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
};

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso.slice(0, 16);
  }
}

export function AttachmentPreviewModal({ item, onClose, onDelete }: AttachmentPreviewModalProps) {
  const [zoomLevel, setZoomLevel] = useState<"fit" | "full">("fit");

  useEffect(() => {
    if (!item) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  const isImage = item.mime.startsWith("image/") || /\.(jpe?g|png|webp|gif|svg)$/i.test(item.name);
  const isPdf = item.mime === "application/pdf" || item.name.toLowerCase().endsWith(".pdf");
  const effectiveUrl = item.url || (item.id ? `/api/files/${encodeURIComponent(item.id)}` : null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-xs max-sm:p-0"
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 flex flex-col w-full max-w-4xl max-h-[92vh] max-sm:max-h-full max-sm:h-full rounded-2xl bg-white shadow-2xl overflow-hidden max-sm:rounded-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5 bg-neutral-50 max-sm:pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
          <div className="flex items-center gap-2.5 min-w-0 pr-3">
            <span className="text-xl shrink-0">
              {isImage ? "🖼️" : isPdf ? "📄" : "📎"}
            </span>
            <div className="min-w-0">
              <h2 id="preview-modal-title" className="text-sm font-semibold text-neutral-900 truncate">
                {item.name}
              </h2>
              <p className="text-[11px] text-neutral-500 truncate">
                {item.mime} &bull; {formatBytes(item.byteSize)}
                {item.uploadedByName ? ` &bull; Uploaded by ${item.uploadedByName}` : ""}
                {item.uploadedAt ? ` on ${formatDate(item.uploadedAt)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isImage ? (
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => (prev === "fit" ? "full" : "fit"))}
                className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 transition"
                title="Toggle zoom level"
              >
                {zoomLevel === "fit" ? "100% Zoom" : "Fit Screen"}
              </button>
            ) : null}
            {effectiveUrl ? (
              <a
                href={effectiveUrl}
                download={item.name}
                className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 transition min-h-[36px]"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download</span>
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 transition"
              aria-label="Close preview"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body Viewer */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-neutral-900/5 min-h-[300px]">
          {isImage && effectiveUrl ? (
            <div className={`flex items-center justify-center w-full h-full ${zoomLevel === "full" ? "overflow-auto p-4" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={effectiveUrl}
                alt={item.name}
                className={`rounded-lg object-contain shadow-md transition-all ${
                  zoomLevel === "fit" ? "max-h-[72vh] max-w-full" : "max-w-none"
                }`}
              />
            </div>
          ) : isPdf && effectiveUrl ? (
            <div className="w-full h-full flex flex-col items-center">
              <iframe
                src={`${effectiveUrl}#view=FitH`}
                title={item.name}
                className="w-full h-[68vh] max-sm:h-[calc(100vh-160px)] rounded-lg border border-neutral-200 bg-white shadow-xs"
              />
              <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                <a
                  href={effectiveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-neutral-900 underline hover:text-neutral-700"
                >
                  Open in separate browser tab &rarr;
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-600 max-w-md">
              <span className="text-4xl mb-3">📄</span>
              <h3 className="text-sm font-semibold text-neutral-900">{item.name}</h3>
              <p className="mt-1 text-xs text-neutral-500">
                {item.mime} &bull; {formatBytes(item.byteSize)}
              </p>
              <p className="mt-2 text-xs text-neutral-400">
                In-app visual rendering is not supported for this file type. Click below to download or view with your system application.
              </p>
              {effectiveUrl ? (
                <a
                  href={effectiveUrl}
                  download={item.name}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 transition min-h-[44px]"
                >
                  Download {item.name}
                </a>
              ) : (
                <p className="mt-3 text-xs text-rose-500 font-medium">Download link unavailable.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer Meta & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-white px-5 py-3 text-xs text-neutral-500 max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex flex-wrap items-center gap-3">
            {item.warehouse ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 font-medium text-neutral-800">
                📍 {item.warehouse}
              </span>
            ) : null}
            {item.category ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 font-medium text-neutral-800">
                📁 {item.category}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {onDelete && item.id ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm("Are you sure you want to delete this file?")) {
                    onDelete(item.id!);
                    onClose();
                  }
                }}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 font-medium text-red-600 hover:bg-red-50 transition min-h-[36px]"
              >
                Delete file
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50 transition min-h-[36px]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
