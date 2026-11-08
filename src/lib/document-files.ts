const files = new Map<string, File>();

export function rememberDocumentFile(id: string, file: File): void {
  files.set(id, file);
}

export function recallDocumentFile(id: string): File | undefined {
  return files.get(id);
}

export function forgetDocumentFile(id: string): void {
  files.delete(id);
}

export function clearDocumentFiles(): void {
  files.clear();
}
