"use client";

import { useRef, useState } from "react";
import { compressImageIfNeeded, fileToBase64, MAX_FILE_SIZE_BYTES } from "@/lib/client-image";
import { uploadWithRetry } from "@/lib/upload-retry";
import { confirmUploadAction, createUploadTargetAction, deleteFileAction } from "@/domain/actions";
import type { DocumentKind } from "@/domain/schemas";
import { useDemo } from "@/components/providers/workspace-provider";

let uploadItemCounter = 0;
function createLocalUploadId(filename: string): string {
  uploadItemCounter += 1;
  return `upload-${uploadItemCounter}-${filename.replace(/[^a-zA-Z0-9]/g, "")}`;
}

export type UploadItem = {
  id: string; // client local id
  fileId?: string; // server document id
  file: File;
  name: string;
  size: number;
  originalSize: number;
  wasCompressed?: boolean;
  mime: string;
  thumbnailUrl: string | null;
  progress: number;
  status: "compressing" | "uploading" | "saved" | "failed";
  error?: string;
};

export interface UploadCaptureProps {
  kind: DocumentKind;
  acceptPdf?: boolean;
  multiple?: boolean;
  shipmentId?: string;
  shipmentReference?: string;
  requestId?: string;
  requestNumber?: string;
  poNumber?: string;
  containerNumber?: string;
  warehouse?: string;
  notes?: string;
  onUploadSuccess?: (docId: string, name: string) => void;
  onFileRemoved?: (fileId: string) => void;
  label?: string;
  helperText?: string;
  className?: string;
}

export function UploadCapture({
  kind,
  acceptPdf = true,
  multiple = true,
  shipmentId,
  shipmentReference,
  requestId,
  requestNumber,
  poNumber,
  containerNumber,
  warehouse,
  notes,
  onUploadSuccess,
  onFileRemoved,
  label,
  helperText,
  className = "",
}: UploadCaptureProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [cameraWarning, setCameraWarning] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const demo = useDemo();

  // Test camera permission / support on mount or click
  const handleCameraClick = async () => {
    setCameraWarning(null);
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        // Stop the probe stream immediately
        stream.getTracks().forEach((track) => track.stop());
        cameraInputRef.current?.click();
      } catch (err) {
        const msg =
          err instanceof Error && err.name === "NotAllowedError"
            ? "Camera permission was denied. Please use 'Choose file' to select a photo from your gallery."
            : "Camera is unavailable on this device. Please use 'Choose file'.";
        setCameraWarning(msg);
        // Fall back to Choose file
        fileInputRef.current?.click();
      }
    } else {
      cameraInputRef.current?.click();
    }
  };

  const activeSignaturesRef = useRef<Set<string>>(new Set());

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;

    for (const rawFile of files) {
      const signature = `${rawFile.name}:${rawFile.size}:${rawFile.lastModified || 0}`;
      if (activeSignaturesRef.current.has(signature)) {
        continue;
      }
      activeSignaturesRef.current.add(signature);

      const localId = createLocalUploadId(rawFile.name);
      const isImg = rawFile.type.startsWith("image/");
      const thumb = isImg ? URL.createObjectURL(rawFile) : null;

      const newItem: UploadItem = {
        id: localId,
        file: rawFile,
        name: rawFile.name,
        size: rawFile.size,
        originalSize: rawFile.size,
        wasCompressed: false,
        mime: rawFile.type || "application/octet-stream",
        thumbnailUrl: thumb,
        progress: 10,
        status: "compressing",
      };

      setItems((prev) => [newItem, ...prev]);

      // Immediate upload execution
      void startUpload(newItem, signature);
    }
  };

  const startUpload = async (item: UploadItem, signature?: string) => {
    try {
      // 1. Initial size check
      if (item.file.size > MAX_FILE_SIZE_BYTES) {
        if (signature) activeSignaturesRef.current.delete(signature);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, status: "failed", error: "File exceeds 10 MB limit." }
              : it
          )
        );
        return;
      }

      // 2. Client-side compression
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, progress: 30 } : it))
      );
      const compressed = await compressImageIfNeeded(item.file);

      // 3. Convert to base64
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                progress: 50,
                status: "uploading",
                name: compressed.name,
                size: compressed.size,
                originalSize: compressed.originalSize,
                wasCompressed: compressed.wasCompressed,
              }
            : it
        )
      );
      const base64 = await fileToBase64(compressed.blob);

      // 4. Upload with exponential backoff & retry
      await uploadWithRetry(
        async () => {
          // A: Create target
          const targetRes = await createUploadTargetAction({
            filename: compressed.name,
            mime: compressed.mime,
            byteSize: compressed.size,
            kind,
            requestId: requestId || null,
            requestNumber: requestNumber || null,
            shipmentId: shipmentId || null,
            poNumber: poNumber || null,
            containerNumber: containerNumber || shipmentReference || null,
            warehouse: warehouse || null,
            notes: notes || null,
          });

          if (!targetRes.ok) {
            throw new Error(targetRes.error);
          }

          const fileId = targetRes.value.fileId;
          setItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, fileId, progress: 75 } : it))
          );

          // B: Confirm upload with content
          const confirmRes = await confirmUploadAction(fileId, base64);
          if (!confirmRes.ok) {
            throw new Error(confirmRes.error);
          }

          if (onUploadSuccess) {
            onUploadSuccess(fileId, confirmRes.value.readableName || item.name);
          }

          // Trigger workspace refresh before marking "saved" so callers waiting on "Saved" do not race with refresh
          if (demo?.refresh) {
            await demo.refresh();
          }

          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    fileId,
                    name: confirmRes.value.readableName || it.name,
                    progress: 100,
                    status: "saved",
                  }
                : it
            )
          );
        },
        {
          maxRetries: 3,
          onRetry: (attempt, maxRetries) => {
            setItems((prev) =>
              prev.map((it) =>
                it.id === item.id
                  ? { ...it, error: `Upload attempt ${attempt} of ${maxRetries} failed. Retrying...` }
                  : it
              )
            );
          },
        }
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Upload failed. Please check network.";
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "failed", error: errMsg } : it))
      );
    }
  };

  const handleRemove = async (item: UploadItem) => {
    const signature = `${item.file.name}:${item.file.size}:${item.file.lastModified || 0}`;
    activeSignaturesRef.current.delete(signature);
    if (item.thumbnailUrl) {
      URL.revokeObjectURL(item.thumbnailUrl);
    }
    if (item.fileId) {
      try {
        await deleteFileAction(item.fileId);
        if (onFileRemoved) onFileRemoved(item.fileId);
        if (demo?.refresh) {
          await demo.refresh();
        }
      } catch (err) {
        console.error("Failed to delete file from store:", err);
      }
    }
    setItems((prev) => prev.filter((it) => it.id !== item.id));
  };

  const handleRetry = (item: UploadItem) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, status: "uploading", error: undefined, progress: 10 } : it
      )
    );
    void startUpload(item);
  };

  const acceptedTypes = acceptPdf ? "image/*,application/pdf" : "image/*";

  return (
    <div className={`space-y-3 ${className}`}>
      {label ? <p className="text-xs font-semibold text-neutral-900">{label}</p> : null}

      {/* Camera permission or error alert */}
      {cameraWarning ? (
        <div
          role="alert"
          className="rounded-lg border border-neutral-300 bg-neutral-100 p-3 text-xs leading-5 text-neutral-800"
        >
          <span className="font-semibold">Notice: </span>
          {cameraWarning}
        </div>
      ) : null}

      {/* Two Large Touch-Friendly Buttons (>= 48px touch targets) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Button 1: Take Photo */}
        <button
          type="button"
          onClick={handleCameraClick}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.99]"
          id="btn-take-photo"
          aria-label="Take photo with device camera"
        >
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span>Take photo</span>
        </button>

        {/* Hidden Camera Input */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            void processFiles(files);
          }}
        />

        {/* Button 2: Choose File */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border-2 border-neutral-900 bg-white px-4 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-100 active:scale-[0.99]"
          id="btn-choose-file"
          aria-label="Choose image or PDF file from device"
        >
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <span>Choose file</span>
        </button>

        {/* Hidden Choose File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            void processFiles(files);
          }}
        />
      </div>

      {helperText ? <p className="text-xs text-neutral-500">{helperText}</p> : null}

      {/* Immediate Upload Status List */}
      {items.length > 0 ? (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {items.map((item) => {
            const isPdf = item.mime === "application/pdf" || item.name.toLowerCase().endsWith(".pdf");

            return (
              <li key={item.id} className="flex items-center gap-3 p-3">
                {/* Thumbnail / Icon */}
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-neutral-300 bg-neutral-100">
                  {isPdf ? (
                    <div className="flex flex-col items-center justify-center text-neutral-700">
                      <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-[9px] font-bold tracking-wider">PDF</span>
                    </div>
                  ) : item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnailUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-neutral-500">IMG</span>
                  )}
                </div>

                {/* Details & Progress Bar */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-neutral-900" title={item.name}>
                      {item.name}
                    </p>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider ${
                        item.status === "saved"
                          ? "text-emerald-700"
                          : item.status === "failed"
                          ? "text-red-600"
                          : "text-neutral-500"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <p className="text-[11px] text-neutral-500">
                    {item.wasCompressed && item.originalSize > item.size
                      ? `${Math.max(1, Math.round(item.originalSize / 1024))} KB → ${Math.max(1, Math.round(item.size / 1024))} KB (-${Math.round((1 - item.size / item.originalSize) * 100)}%)`
                      : `${Math.max(1, Math.round(item.size / 1024))} KB`}{" "}
                    · {kind}
                  </p>

                  {/* Progress Bar */}
                  {item.status === "uploading" || item.status === "compressing" ? (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full bg-neutral-950 transition-all duration-300 ease-out"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  ) : null}

                  {item.error ? <p className="mt-1 text-xs text-red-600">{item.error}</p> : null}
                </div>

                {/* Actions: Retry or Remove */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {item.status === "failed" ? (
                    <button
                      type="button"
                      onClick={() => handleRetry(item)}
                      className="min-h-[40px] rounded border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50 active:scale-95"
                    >
                      Retry
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleRemove(item)}
                    className="min-h-[40px] rounded border border-neutral-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 active:scale-95"
                    title="Remove file"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
