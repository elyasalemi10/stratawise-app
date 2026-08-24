import { OCSettingsSkeleton } from "./oc-settings-skeleton";

// Same skeleton the client renders, so the handover from this boundary to
// OCSettingsClient is continuous rather than a blank frame.
export default function Loading() {
  return <OCSettingsSkeleton />;
}
