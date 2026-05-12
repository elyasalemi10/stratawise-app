import "server-only";
import { GoogleGenAI, Type } from "@google/genai";

// Plan-of-Subdivision parser. Gemini 2.5 Pro vision over the raw PDF with a
// structured response schema, so the result is always the same shape and we
// never have to parse free-text. Confidence is per-field so the UI can tint
// low-confidence cells amber and prompt the user to verify.

export type ParsedLot = {
  lot_number: number;
  unit_entitlement: number;
  lot_liability: number;
  confidence: number;
};

export type ParsedOC = {
  oc_number: number;
  oc_name: string | null;
  address: string | null;
  street_number: string | null;
  street_name: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  lot_count: number;
  lots: ParsedLot[];
};

export type ParsedPlan = {
  plan_of_subdivision_number: string | null;
  plan_of_subdivision_confidence: number;
  detected_ocs: ParsedOC[];
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    plan_of_subdivision_number: { type: Type.STRING, nullable: true, description: "Plan-of-Subdivision identifier, e.g. PS812345X. Null if not visible." },
    plan_of_subdivision_confidence: { type: Type.NUMBER, description: "0-1 confidence in the extracted plan number." },
    detected_ocs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          oc_number: { type: Type.INTEGER, description: "OC ordinal in the plan (1 for OC1, 2 for OC2, etc.). Use 1 if only one OC." },
          oc_name: { type: Type.STRING, nullable: true },
          address: { type: Type.STRING, nullable: true, description: "Full address as written on the plan." },
          street_number: { type: Type.STRING, nullable: true },
          street_name: { type: Type.STRING, nullable: true },
          suburb: { type: Type.STRING, nullable: true },
          state: { type: Type.STRING, nullable: true, description: "AU state code, e.g. VIC." },
          postcode: { type: Type.STRING, nullable: true, description: "4-digit AU postcode." },
          lot_count: { type: Type.INTEGER },
          lots: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                lot_number: { type: Type.INTEGER },
                unit_entitlement: { type: Type.NUMBER },
                lot_liability: { type: Type.NUMBER },
                confidence: { type: Type.NUMBER, description: "0-1 confidence in this row's three numbers." },
              },
              required: ["lot_number", "unit_entitlement", "lot_liability", "confidence"],
            },
          },
        },
        required: ["oc_number", "lot_count", "lots"],
      },
    },
  },
  required: ["plan_of_subdivision_confidence", "detected_ocs"],
};

const SYSTEM_PROMPT = `You extract structured data from Victorian Plan-of-Subdivision PDFs.

A Plan of Subdivision (PS) is a registered survey document under the Subdivision Act 1988 (Vic). It can create one or more Owners Corporations (OCs); each OC has its own lot schedule with per-lot Unit Entitlement and Lot Liability (typically integers summing to 100 or 1000, sometimes equal per lot).

Rules:
- Return ALL OCs found on the plan, not just the largest one.
- Lot numbers, unit entitlement, and lot liability come from the lot schedule table (often titled "Schedule of Lot Entitlement and Liability" or similar).
- If the plan creates only one OC, set oc_number=1.
- If a field is illegible or not present, return null and confidence below 0.5.
- Confidence reflects how clearly the value is rendered, not how plausible it is.
- Do NOT invent lot numbers. Do NOT extrapolate from the lot count. Only report lots actually present in the schedule.
- Address: include the full registered address. State for VIC plans is "VIC".`;

export async function parsePlanPdf(pdfBytes: Buffer): Promise<ParsedPlan> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const ai = new GoogleGenAI({ apiKey });

  const result = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: [
      {
        role: "user",
        parts: [
          { text: "Extract the Plan-of-Subdivision details and full lot schedule from this PDF." },
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
    throw new Error("Gemini returned an empty response");
  }
  const parsed = JSON.parse(text) as ParsedPlan;
  return parsed;
}
