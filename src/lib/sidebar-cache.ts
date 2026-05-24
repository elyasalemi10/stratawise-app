import type { SidebarProfile } from "@/lib/actions/profile";
import type { SidebarOC } from "@/lib/actions/oc";

const PROFILE_KEY = "stratawise_sidebar_profile";
const SUBDIVISIONS_KEY = "stratawise_sidebar_ocs";
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

interface CachedData<T> {
  data: T;
  timestamp: number;
}

function getCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const cached: CachedData<T> = JSON.parse(raw);
    if (Date.now() - cached.timestamp > MAX_AGE_MS) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    const cached: CachedData<T> = { data, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // localStorage full or unavailable , ignore
  }
}

export function getCachedProfile(): SidebarProfile | null {
  return getCache<SidebarProfile>(PROFILE_KEY);
}

export function setCachedProfile(data: SidebarProfile): void {
  setCache(PROFILE_KEY, data);
}

export function getCachedOCs(): SidebarOC[] | null {
  return getCache<SidebarOC[]>(SUBDIVISIONS_KEY);
}

export function setCachedOCs(data: SidebarOC[]): void {
  setCache(SUBDIVISIONS_KEY, data);
}

export function clearSidebarCache(): void {
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(SUBDIVISIONS_KEY);
  } catch {
    // ignore
  }
}

/**
 * Event name the sidebar listens for. Kept as an export so callers don't
 * duplicate the string literal (grep-safety).
 */
export const SIDEBAR_REFRESH_EVENT = "stratawise-sidebar:refresh";

/**
 * Call this from ANY client-side mutation success handler that affected the
 * sidebar unmatched count (reconciliation actions, CSV import, etc.). It:
 *   1. Clears the localStorage fast-path so the next mount reads fresh data.
 *   2. Fires a custom event the mounted sidebar listens for, triggering an
 *      immediate server-action re-fetch without a page reload.
 * The corresponding server-side revalidateTag is the responsibility of each
 * mutation server action , see revalidateSidebarForOC.
 */
export function revalidateSidebarFromClient(): void {
  clearSidebarCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SIDEBAR_REFRESH_EVENT));
  }
}
