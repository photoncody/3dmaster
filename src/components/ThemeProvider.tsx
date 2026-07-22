"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  cyclePreference: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function isResolvedTheme(value: string | null | undefined): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  return resolved;
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    /* ignore */
  }
  return "system";
}

/** Prefer the preference already applied by the head script, then localStorage. */
function getInitialPreference(): ThemePreference {
  if (typeof document !== "undefined") {
    const fromDom = document.documentElement.dataset.themePreference;
    if (isThemePreference(fromDom)) return fromDom;
  }
  if (typeof window === "undefined") return "system";
  return readStoredPreference();
}

function getInitialResolved(): ResolvedTheme {
  if (typeof document !== "undefined") {
    const fromDom = document.documentElement.dataset.theme;
    if (isResolvedTheme(fromDom)) return fromDom;
  }
  return resolveTheme(getInitialPreference());
}

function persistPreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    getInitialPreference,
  );
  const [resolved, setResolved] = useState<ResolvedTheme>(getInitialResolved);

  useEffect(() => {
    // Re-sync in case storage changed between the head script and hydration.
    const current = readStoredPreference();
    setPreferenceState(current);
    setResolved(applyTheme(current));

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      setPreferenceState((currentPreference) => {
        if (currentPreference === "system") {
          setResolved(applyTheme("system"));
        }
        return currentPreference;
      });
    };
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setResolved(applyTheme(next));
    persistPreference(next);
  }, []);

  const cyclePreference = useCallback(() => {
    setPreferenceState((current) => {
      // Always advance from the persisted preference so a stale React state
      // cannot overwrite a saved light/dark choice.
      const baseline = readStoredPreference();
      const from = isThemePreference(baseline) ? baseline : current;
      const order: ThemePreference[] = ["system", "light", "dark"];
      const next = order[(order.indexOf(from) + 1) % order.length];
      setResolved(applyTheme(next));
      persistPreference(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider
      value={{ preference, resolved, setPreference, cyclePreference }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
