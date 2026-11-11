import { create } from "zustand";

import type { ScanCompleted, ScanProgress } from "../lib/bindings.generated";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
  sticky?: boolean;
}

export interface ScanState {
  scanId: string;
  scanned: number;
  found: number;
  currentPath: string;
}

interface UiState {
  search: string;
  toasts: Toast[];
  liveMessage: string;
  scan: ScanState | null;
  scanResults: ScanCompleted | null;
  scanOpen: boolean;
  setSearch: (value: string) => void;
  addToast: (toast: Omit<Toast, "id">) => string;
  dismissToast: (id: string) => void;
  setLiveMessage: (message: string) => void;
  setScanProgress: (progress: ScanProgress) => void;
  setScanResults: (results: ScanCompleted) => void;
  clearScan: () => void;
  openScanResults: () => void;
  closeScanResults: () => void;
}

let toastCounter = 0;

export const useUi = create<UiState>((set, get) => ({
  search: "",
  toasts: [],
  liveMessage: "",
  scan: null,
  scanResults: null,
  scanOpen: false,
  setSearch: (value) => set({ search: value }),
  addToast: (toast) => {
    // Collapse identical messages (for example React StrictMode mounting an
    // effect twice) so users are not shown the same error in a stack.
    const existing = get().toasts.find(
      (item) =>
        item.tone === toast.tone && item.title === toast.title && item.message === toast.message,
    );
    if (existing) return existing.id;
    toastCounter += 1;
    const id = `toast-${toastCounter}`;
    const next = { ...toast, id };
    set({ toasts: [...get().toasts, next].slice(-3) });
    if (!toast.sticky) {
      window.setTimeout(() => {
        useUi.getState().dismissToast(id);
      }, 4000);
    }
    return id;
  },
  dismissToast: (id) => {
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },
  setLiveMessage: (message) => set({ liveMessage: message }),
  setScanProgress: (progress) =>
    set({
      scan: {
        scanId: progress.scanId,
        scanned: progress.scanned,
        found: progress.found,
        currentPath: progress.currentPath,
      },
    }),
  setScanResults: (results) => set({ scanResults: results, scanOpen: true, scan: null }),
  clearScan: () => set({ scan: null, scanResults: null, scanOpen: false }),
  openScanResults: () => set({ scanOpen: true }),
  closeScanResults: () => set({ scanOpen: false }),
}));
