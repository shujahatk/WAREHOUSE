"use client";

import { useState } from "react";
import type { ShipmentAttachment } from "@/domain/view";
import { AttachmentPreviewModal } from "@/components/files/attachment-preview-modal";

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

      {/* In-App Attachment & Document Preview Modal */}
      {selectedFile ? (
        <AttachmentPreviewModal
          item={{
            id: selectedFile.id,
            name: selectedFile.readableName || selectedFile.name,
            mime: selectedFile.mime,
            byteSize: selectedFile.size,
            url: selectedFile.url,
            uploadedByName: selectedFile.uploadedByName || selectedFile.uploadedBy || "Unknown",
            uploadedAt: selectedFile.uploadedAt,
            category: selectedFile.role,
            warehouse: selectedFile.warehouse,
          }}
          onClose={() => setSelectedFile(null)}
          onDelete={
            allowDelete && onDelete
              ? (fileId) => {
                  onDelete(fileId);
                  setSelectedFile(null);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
