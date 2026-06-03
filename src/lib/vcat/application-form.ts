import { PDFDocument } from "pdf-lib";

// Best-effort fill of VCAT's official Application form (a real AcroForm). We
// only set a small, high-confidence set of TEXT fields and leave the rest for
// the manager. Every set is guarded so a renamed/missing field never throws.
// The form is loaded over HTTP from the public asset (works in serverless +
// Trigger.dev). Returns null on any failure , the pack still includes our
// branded Summary of Proofs.

export interface ApplicationFormData {
  claimAmount: string;
  premisesDetails: string;
  premisesAddress: string;
  premisesSuburb: string;
  ocName: string;
  ocRegisteredNo: string;
  contactName: string;
  contactNumber: string;
  contactEmail: string;
}

async function loadTemplateBytes(): Promise<Uint8Array | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return null;
  try {
    const res = await fetch(`${base}/application-form-template.pdf`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function fillApplicationForm(data: ApplicationFormData): Promise<Buffer | null> {
  const bytes = await loadTemplateBytes();
  if (!bytes) return null;
  try {
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    const set = (name: string, value: string) => {
      if (!value) return;
      try { form.getTextField(name).setText(value); } catch { /* field absent/renamed */ }
    };
    set("5-Claim amount", data.claimAmount);
    set("6a1 Provide details of the premises lots or units that are the subject of this dispute", data.premisesDetails);
    set("6a-Address of premises", data.premisesAddress);
    set("6a-Suburb", data.premisesSuburb);
    set("7c-Name undefined_5", data.ocName);
    set("7c-Registered No", data.ocRegisteredNo);
    set("10-Name of contact person", data.contactName);
    set("10-Contact Number", data.contactNumber);
    set("10-Email", data.contactEmail);
    const out = await doc.save();
    return Buffer.from(out);
  } catch (err) {
    console.error("[vcat] application form fill failed:", err);
    return null;
  }
}
