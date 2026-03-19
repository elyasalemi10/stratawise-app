import type { SidebarProfile } from "@/lib/actions/profile";
import type { SidebarSubdivision } from "@/lib/actions/subdivision";

const PROFILE_KEY = "msm_sidebar_profile";
const SUBDIVISIONS_KEY = "msm_sidebar_subdivisions";
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
    // localStorage full or unavailable — ignore
  }
}

export function getCachedProfile(): SidebarProfile | null {
  return getCache<SidebarProfile>(PROFILE_KEY);
}

export function setCachedProfile(data: SidebarProfile): void {
  setCache(PROFILE_KEY, data);
}

export function getCachedSubdivisions(): SidebarSubdivision[] | null {
  return getCache<SidebarSubdivision[]>(SUBDIVISIONS_KEY);
}

export function setCachedSubdivisions(data: SidebarSubdivision[]): void {
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
