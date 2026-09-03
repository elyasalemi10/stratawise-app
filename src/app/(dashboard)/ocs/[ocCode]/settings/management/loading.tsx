import { SectionHeader } from "@/components/shared/section-header";
import { OCSettingsSkeleton } from "../oc-settings-skeleton";
import { OC_SETTINGS_LABEL } from "../nav";

export default function Loading() {
  return (
    <>
      <SectionHeader title={OC_SETTINGS_LABEL.management} />
      <OCSettingsSkeleton section="management" />
    </>
  );
}
