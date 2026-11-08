"use client";

import { useState } from "react";
import type { ShipmentAttachment } from "@/domain/view";

export interface FileGalleryProps {
  files: ShipmentAttachment[];
  title?: string;
  emptyMessage?: string;
  allowDelete?: boolean;
  onDelete?: (fileId: string) => void;
  className?: string;
}

export function FileGallery({
  files,
  title = "Attached Documents & Photos",
  emptyMessage = "No files attached yet.",
  allowDelete = false,
  onDelete,
  className = "",
}: FileGalleryProps) {
  const [selectedFile, setSelectedFile] = useState<ShipmentAttachment | null>(null);

  return (
    <div className={`space-y-3 ${className}`}>
      {title ? (
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-900">{title}</h3>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
            {files.length} {files.length === 1 ? "file" : "files"}
          </span>
        </div>
      ) : null}

      {files.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {files.map((file) => {
            const isPdf = file.mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

            return (
              <div
                key={file.id}
                onClick={() => setSelectedFile(file)}
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white transition hover:border-neutral-950 hover:shadow-sm"
                tabIndex={0}
                role="button"
                aria-label={`View details for ${file.name}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setSelectedFile(file);
                  }
                }}
              >
                {/* Thumbnail Header */}
                <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-neutral-100">
                  {isPdf ? (
                    <div className="flex flex-col items-center justify-center text-neutral-700">
                      <svg className="h-10 w-10 text-neutral-600" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="mt-1 text-[10px] font-bold tracking-widest text-neutral-800">PDF</span>
                    </div>
                  ) : file.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={file.url}
                      alt={file.name}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-neutral-400">NO PREVIEW</span>
                  )}

                  {/* Type Badge */}
                  <span className="absolute top-1.5 left-1.5 rounded bg-neutral-950/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                    {file.role}
                  </span>
                </div>

                {/* Card Meta */}
                <div className="flex flex-1 flex-col justify-between p-2.5">
                  <div>
                    <p className="truncate text-xs font-medium text-neutral-900" title={file.name}>
                      {file.readableName || file.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-neutral-500">
                      {file.uploadedByName || file.uploadedBy || "Uploader"}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-1 text-[10px] text-neutral-500">
                    <span>{(file.size / 1024).toFixed(0)} KB</span>
                    <span className="font-mono text-neutral-700">{file.requestNumber || file.po || ""}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Lightbox & Full Details Panel */}
      {selectedFile ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedFile(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="absolute top-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white transition hover:bg-neutral-700"
              aria-label="Close details"
            >
              ✕
            </button>

            {/* Media Preview Area */}
            <div className="flex flex-1 items-center justify-center bg-neutral-950 p-4 md:max-w-[60%]">
              {selectedFile.mime === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf") ? (
                <div className="flex flex-col items-center justify-center gap-4 text-center text-white">
                  <svg className="h-16 w-16 text-neutral-300" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <p className="font-semibold">{selectedFile.readableName || selectedFile.name}</p>
                    <p className="text-xs text-neutral-400">PDF Document ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
                  </div>
                  {selectedFile.url ? (
                    <a
                      href={selectedFile.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-neutral-950 hover:bg-neutral-100"
                    >
                      Open PDF in new tab
                    </a>
                  ) : null}
                </div>
              ) : selectedFile.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedFile.url}
                  alt={selectedFile.name}
                  className="max-h-[70vh] max-w-full rounded object-contain"
                />
              ) : (
                <p className="text-xs text-neutral-400">No preview available</p>
              )}
            </div>

            {/* Details Panel */}
            <div className="flex w-full flex-col justify-between overflow-y-auto p-5 md:w-[40%]">
              <div>
                <div className="border-b border-neutral-200 pb-3">
                  <span className="rounded bg-neutral-950 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    {selectedFile.role}
                  </span>
                  <h4 className="mt-2 text-sm font-bold text-neutral-900 break-words">
                    {selectedFile.readableName || selectedFile.name}
                  </h4>
                  {selectedFile.originalFilename && selectedFile.originalFilename !== selectedFile.readableName ? (
                    <p className="mt-0.5 text-xs text-neutral-500 break-words">
                      Original: {selectedFile.originalFilename}
                    </p>
                  ) : null}
                </div>

                {/* Metadata List */}
                <dl className="mt-4 space-y-2.5 text-xs">
                  <div>
                    <dt className="text-neutral-500">File ID</dt>
                    <dd className="font-mono text-neutral-900 break-all">{selectedFile.id}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Request Number</dt>
                    <dd className="font-medium text-neutral-900">{selectedFile.requestNumber || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">PO Number</dt>
                    <dd className="font-medium text-neutral-900">{selectedFile.po || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Container</dt>
                    <dd className="font-medium text-neutral-900">{selectedFile.containerNumber || selectedFile.shipment || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Warehouse</dt>
                    <dd className="font-medium text-neutral-900">{selectedFile.warehouse || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Uploaded By</dt>
                    <dd className="font-medium text-neutral-900">
                      {selectedFile.uploadedByName || selectedFile.uploadedBy || "Unknown"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Uploaded At (UTC)</dt>
                    <dd className="font-mono text-neutral-900">{selectedFile.uploadedAt || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Size & Type</dt>
                    <dd className="text-neutral-900">
                      {(selectedFile.size / 1024).toFixed(1)} KB ({selectedFile.mime})
                    </dd>
                  </div>
                  {selectedFile.notes ? (
                    <div>
                      <dt className="text-neutral-500">Notes</dt>
                      <dd className="mt-0.5 rounded bg-neutral-50 p-2 text-neutral-800">{selectedFile.notes}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col gap-2 border-t border-neutral-200 pt-4">
                {selectedFile.url ? (
                  <a
                    href={selectedFile.url}
                    download={selectedFile.readableName || selectedFile.name}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-800"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download (Time-limited signed URL)
                  </a>
                ) : null}

                {allowDelete && onDelete ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Are you sure you want to delete this file? Mistakes are fixed by deleting and re-uploading.")) {
                        onDelete(selectedFile.id);
                        setSelectedFile(null);
                      }
                    }}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border border-red-300 px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete file
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
