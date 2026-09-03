import { Building2, Landmark, Settings2, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

// Nothing on the wizard's first screen comes from the server: the four step
// labels, the heading, the sentence and the dropzone are all fixed. So there
// is nothing to shimmer , this renders the real thing with the dropzone
// inert, and the only change when the draft arrives is that it starts
// accepting files.
//
// Mirrors ocs/new/page.tsx's pre-draft branch and step-1-0-upload.tsx.

const STEPS = [
  { label: "General", Icon: Building2 },
  { label: "Settings", Icon: Settings2 },
  { label: "Lots & Owners", Icon: Users },
  { label: "Banking", Icon: Landmark },
];

export default function NewOCLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-center gap-x-5 gap-y-4">
        {STEPS.map(({ label, Icon }, i) => (
          <div key={label} className="flex flex-col items-center gap-1.5">
            <div
              className={`flex size-9 items-center justify-center rounded-full border ${
                i === 0
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              <Icon className="size-4" />
            </div>
            <span
              className={`text-xs font-medium ${
                i === 0 ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Upload your plan of subdivision</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;ll read your document and pre-fill the OC details, lot schedule, and entitlements. You can skip this and enter everything manually.
          </p>
        </div>
        <div
          aria-hidden
          className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card text-sm text-muted-foreground opacity-60"
        >
          <Upload className="size-5" />
          Drop your plan here, or click to choose one
        </div>
        <div className="flex items-center justify-end pt-2">
          <Button disabled>Continue</Button>
        </div>
      </div>
    </div>
  );
}
