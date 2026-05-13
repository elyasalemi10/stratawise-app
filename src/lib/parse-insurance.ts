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
};

export type ParsedInsuranceDocument = {
  /** Did Gemini decide this is a real CoC / policy schedule? */
  is_insurance_certificate: boolean;
  /** Free-text guess of what the upload actually is. */
  document_type_guess: string;
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
        },
        required: ["provider", "policy_type"],
      },
    },
  },
  required: ["is_insurance_certificate", "document_type_guess", "policies"],
};

const SYSTEM_PROMPT = `You extract every policy section from a strata / owners-corporation Certificate of Currency or insurance policy schedule PDF.

Rules:
- Return every distinct policy/section the document defines, in source order.
- "Combined" policy_type only when one section explicitly covers BOTH building + public liability together.
- Money fields are AUD numbers, no currency symbols. If a number has commas (e.g. "$12,500,000") strip them and return 12500000.
- Dates: ISO yyyy-mm-dd. Australian DD/MM/YYYY is the dominant source format — convert carefully.

Document-type gate:
- BEFORE extracting anything, decide whether this PDF IS a CoC or policy schedule for a strata building.
- If it's something else (plan of subdivision, OC rules, levy notice, photo, contract, blank page), set is_insurance_certificate=false, document_type_guess to your best one-line description, and return policies=[].
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
    model: "gemini-2.5-pro",
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
