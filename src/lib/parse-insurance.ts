import "server-only";
import { GoogleGenAI, Type } from "@google/genai";

// Insurance Certificate of Currency / policy schedule parser (Gemini 2.5 Pro).
//
// Most OCs receive an annual "Certificate of Currency" PDF from their insurer
// (CHU, Strata Community Insurance, QBE, Longitude, etc.). It lists every
// policy section the OC holds: building, public liability, voluntary workers,
// fidelity guarantee, etc. We extract the fields that map onto our
// insurance_policies row shape so the wizard can prefill the form.

export type ParsedInsurancePolicy = {
  provider: string;
  policy_number: string | null;
  policy_type: "building" | "public_liability" | "combined" | "fidelity" | "voluntary_workers" | "other";
  sum_insured: number | null;
  premium: number | null;
  start_date: string | null;      // ISO yyyy-mm-dd
  end_date: string | null;        // ISO yyyy-mm-dd
  /** 24h HH:MM. Australian CoCs typically state cover times as "4:00pm" —
   *  preserve when present, null when the cert is date-only. */
  start_time: string | null;
  end_time: string | null;
};

export type ParsedInsuranceDocument = {
  /** Did Gemini decide this is a real CoC / policy schedule? */
  is_insurance_certificate: boolean;
  /** Free-text guess of what the upload actually is. */
  document_type_guess: string;
  /** Plan-of-Subdivision number shown on the certificate, if present.
   *  Format: PS + 6 digits + 1 letter (e.g. "PS812345X"). Null if not located. */
  plan_number: string | null;
  /** "Insured" / "Owners Corporation" name from the cert header, if present. */
  insured_name: string | null;
  policies: ParsedInsurancePolicy[];
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_insurance_certificate: {
      type: Type.BOOLEAN,
      description:
        "True ONLY if this PDF is a Certificate of Currency or insurance policy schedule for a strata / owners-corporation building. False for plan-of-subdivision PDFs, OC rules, levy notices, photos, contracts, or anything else.",
    },
    document_type_guess: { type: Type.STRING, description: "One-line guess of the upload's actual type." },
    plan_number: {
      type: Type.STRING,
      nullable: true,
      description: "Plan-of-Subdivision number shown on the certificate (format PS + 6 digits + 1 letter, e.g. 'PS812345X'). Null if not found.",
    },
    insured_name: {
      type: Type.STRING,
      nullable: true,
      description: "'Insured' / 'Owners Corporation' / 'Body Corporate' name from the certificate header. Null if not found.",
    },
    policies: {
      type: Type.ARRAY,
      description: "Every distinct policy section listed on the certificate. Typically 1-5 entries.",
      items: {
        type: Type.OBJECT,
        properties: {
          provider: { type: Type.STRING, description: "Insurer/underwriter name (e.g. 'CHU Underwriting Agencies', 'Strata Community Insurance', 'QBE')." },
          policy_number: { type: Type.STRING, nullable: true, description: "Policy number verbatim. Null if not shown." },
          policy_type: {
            type: Type.STRING,
            enum: ["building", "public_liability", "combined", "fidelity", "voluntary_workers", "other"],
            description: "Best-fit category. Use 'combined' when one policy clearly covers building + public liability.",
          },
          sum_insured: { type: Type.NUMBER, nullable: true, description: "Sum insured in AUD. Strip currency symbols + commas. Null if not applicable (public liability has 'limit of liability' — use that)." },
          premium: { type: Type.NUMBER, nullable: true, description: "Annual premium in AUD inclusive of GST + stamp duty. Null if not shown." },
          start_date: { type: Type.STRING, nullable: true, description: "ISO yyyy-mm-dd. Period of insurance FROM date." },
          end_date: { type: Type.STRING, nullable: true, description: "ISO yyyy-mm-dd. Period of insurance TO date." },
          start_time: { type: Type.STRING, nullable: true, description: "24-hour HH:MM time the cover starts on start_date, if the certificate states one (e.g. '4:00pm' → '16:00'). Null when only a date is given." },
          end_time: { type: Type.STRING, nullable: true, description: "24-hour HH:MM time the cover ends on end_date, if stated. Null when only a date is given." },
        },
        required: ["provider", "policy_type"],
      },
    },
  },
  required: ["is_insurance_certificate", "document_type_guess", "plan_number", "insured_name", "policies"],
};

const SYSTEM_PROMPT = `You extract every policy section from a strata / owners-corporation Certificate of Currency or insurance policy schedule PDF.

CRITICAL — how to count policies:
- A "policy" is anything the cert assigns its OWN policy number to. ONE policy number = ONE policy, even if the cert lists multiple coverage limits under it (e.g. "Sum Insured" for the building AND "Legal Liability" / "Public Liability" / "Workers Compensation" as separate limits within the same policy).
- Australian strata policies are typically BUNDLED — a single "Strata Building" or "Residential Strata" policy carries Building, Public/Legal Liability, sometimes Voluntary Workers and Fidelity, all under one policy number. Output ONE entry with policy_type="combined" when you see that.
- DO NOT emit a separate policy entry for each coverage limit. If you see policy number HSA154109901 with Sum Insured $3,045,000 AND Legal Liability $20 million, that's ONE policy with sum_insured=3045000 and policy_type="combined" — NOT two policies.
- Emit a separate policy entry only when there's a DIFFERENT policy_number (e.g. a separate "fidelity guarantee" policy from a different insurer or with a distinct policy number).

Other rules:
- Return policies in source order.
- Money fields are AUD numbers, no currency symbols. Strip commas: "$12,500,000" → 12500000.
- "Legal Liability $20 million" → 20000000 (parse abbreviations like 'million' / 'm' / 'mn').
- Dates: ISO yyyy-mm-dd. Australian DD/MM/YYYY is the dominant source format — convert carefully.
- Times: When the cert explicitly states a time alongside the period of insurance ("from 4:00pm 1 May 2024 to 4:00pm 1 May 2025" is the Australian strata convention), populate start_time + end_time as 24-hour HH:MM. "4:00pm" → "16:00", "9:00am" → "09:00". When only a date is given, leave both null — don't guess.
- plan_number: scan the cert for the Plan-of-Subdivision identifier ("PS812345X" or similar — "PS" + 6 digits + 1 letter). Typically near the address or under "Insured" / "Property Description". Case-insensitive — emit upper-case. Null if not present.
- insured_name: the named insured / owners corporation name from the cert header. Null if not present.

Document-type gate:
- BEFORE extracting anything, decide whether this PDF IS a CoC or policy schedule for a strata building.
- If it's something else (plan of subdivision, OC rules, levy notice, photo, contract, blank page), set is_insurance_certificate=false, document_type_guess to your best one-line description, plan_number=null, insured_name=null, and policies=[].
- When in doubt return false. The manager can re-upload.`;

type ServiceAccount = { project_id?: string; client_email?: string; private_key?: string };

function buildClient(): GoogleGenAI {
  const raw = process.env.GEMINI_API_KEY;
  if (!raw) {
    console.error("parseInsurancePdf: GEMINI_API_KEY missing");
    throw new Error("Automatic insurance parsing is temporarily unavailable.");
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    let credentials: ServiceAccount;
    try {
      credentials = JSON.parse(trimmed) as ServiceAccount;
    } catch {
      throw new Error("Automatic insurance parsing is temporarily unavailable.");
    }
    const location = process.env.GEMINI_LOCATION?.trim() || "global";
    return new GoogleGenAI({
      vertexai: true,
      project: credentials.project_id,
      location,
      googleAuthOptions: { credentials },
    });
  }
  return new GoogleGenAI({ apiKey: trimmed });
}

export async function parseInsurancePdf(pdfBytes: Buffer): Promise<ParsedInsuranceDocument> {
  const ai = buildClient();
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: "Extract every policy section from this strata insurance certificate." },
          { inlineData: { mimeType: "application/pdf", data: pdfBytes.toString("base64") } },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.1,
      // Insurance schedules are short (1-5 policies typically) so the
      // default would usually be fine — but a 65535 cap costs nothing
      // when the model emits a smaller response and saves us from one
      // class of silent truncation.
      maxOutputTokens: 65535,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  const text = result.text;
  if (!text) {
    console.error("parseInsurancePdf: empty response from model");
    throw new Error("Automatic insurance parsing returned no data.");
  }
  return JSON.parse(text) as ParsedInsuranceDocument;
}
