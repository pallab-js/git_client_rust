import { create } from "zustand";

import type {
  NotificationSettings,
  Settings,
  SettingsPatch,
  Theme,
  WatchMode,
} from "../lib/bindings.generated";
import { ipc, toAppError } from "../lib/ipc";

export interface SettingsUpdate {
  theme?: Theme;
  startMinimized?: boolean;
  launchAtLogin?: boolean;
  showDockIcon?: Settings["showDockIcon"];
  keepPopoverWarm?: boolean;
  trayBadgeBasis?: Settings["trayBadgeBasis"];
  reconcileIntervalSec?: number;
  idlePollIntervalSec?: number;
  watchMode?: WatchMode;
  linuxWatchDirCap?: number;
  notifications?: NotificationSettings;
  retentionDays?: number;
  snapshotCapPerRepo?: number;
  ignoredPatterns?: string[];
  editor?: string | null;
}

function toPatch(update: SettingsUpdate): SettingsPatch {
  return {
    theme: update.theme ?? null,
    startMinimized: update.startMinimized ?? null,
    launchAtLogin: update.launchAtLogin ?? null,
    showDockIcon: update.showDockIcon ?? null,
    keepPopoverWarm: update.keepPopoverWarm ?? null,
    trayBadgeBasis: update.trayBadgeBasis ?? null,
    reconcileIntervalSec: update.reconcileIntervalSec ?? null,
    idlePollIntervalSec: update.idlePollIntervalSec ?? null,
    watchMode: update.watchMode ?? null,
    linuxWatchDirCap: update.linuxWatchDirCap ?? null,
    notifications: update.notifications ?? null,
    retentionDays: update.retentionDays ?? null,
    snapshotCapPerRepo: update.snapshotCapPerRepo ?? null,
    ignoredPatterns: update.ignoredPatterns ?? null,
    editor: update.editor ?? null,
  };
}

const THEME_KEY = "gitpulse:theme";

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be unavailable; the theme still applies for this session.
  }
}

/**
 * Applies the last known theme before the first paint so the UI does not flash
 * the default dark palette when the saved preference is light.
 */
export function applyCachedTheme(): void {
  if (typeof window === "undefined") return;
  try {
    const cached = window.localStorage.getItem(THEME_KEY);
    if (cached === "light" || cached === "dark" || cached === "system") {
      document.documentElement.dataset.theme = cached;
    }
  } catch {
    // Ignore storage failures.
  }
}

interface SettingsState {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  update: (update: SettingsUpdate) => Promise<Settings>;
  setLocal: (settings: Settings) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const settings = await ipc.getSettings();
      applyTheme(settings.theme);
      set({ settings, loading: false });
    } catch (error) {
      set({ loading: false, error: toAppError(error).message });
    }
  },
  update: async (update) => {
    const settings = await ipc.updateSettings(toPatch(update));
    applyTheme(settings.theme);
    set({ settings, error: null });
    return settings;
  },
  setLocal: (settings) => {
    applyTheme(settings.theme);
    set({ settings });
  },
}));

export function currentSettings(): Settings | null {
  return useSettings.getState().settings;
}

export function settingsOrThrow(): Settings {
  const settings = getSettingsOrNull();
  if (!settings) {
    throw new Error("Settings are not loaded yet.");
  }
  return settings;
}

function getSettingsOrNull(): Settings | null {
  return useSettings.getState().settings;
}

export function patchCurrent(update: SettingsUpdate): void {
  const settings = currentSettings();
  if (!settings) return;
  useSettings.getState().setLocal({ ...settings, ...update });
}

export function defaultNotifications(): NotificationSettings {
  return {
    enabled: false,
    conflicts: true,
    behindThreshold: 5,
    dirtyThreshold: 100,
    rateLimitMinutes: 30,
  };
}
