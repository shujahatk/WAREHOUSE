"use client";

import { createContext, useContext } from "react";

export const WorkspaceSearch = createContext("");

export function useWorkspaceSearch(): string {
  return useContext(WorkspaceSearch);
}
