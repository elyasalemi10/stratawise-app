import "server-only";
import { GoogleGenAI, Type } from "@google/genai";

// Custom OC Rules PDF parser (Gemini 2.5 Pro).
//
// Input: a PDF of registered owners-corporation rules. Output: a flat list of
// numbered rules, each with heading, body text, page number, and an optional
// bounding box on that page (so we can highlight when the manager clicks
// through from a breach notice or chat answer).
//
// We deliberately DON'T try to be exhaustive about formatting — Gemini returns
// the rule body as plain text without source line breaks. The viewer is
// always the source of truth for display; this index is for search + linking.

export type ParsedRule = {
  rule_number: string;
  heading: string | null;
  body: string;
  page_number: number | null;
  bbox: { x: number; y: number; w: number; h: number } | null;
  confidence: number;
};

export type ParsedRulesDocument = {
  /** Did Gemini decide this is a real OC-rules PDF? */
  is_oc_rules: boolean;
  /** Free-text guess of what the upload actually is. */
  document_type_guess: string;
  rules: ParsedRule[];
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_oc_rules: {
      type: Type.BOOLEAN,
      description:
        "True ONLY if this PDF is a registered Victorian Owners Corporation rules document. False for plan-of-subdivision PDFs, insurance certs, levy notices, photos, contracts, or anything else.",
    },
    document_type_guess: { type: Type.STRING, description: "One-line guess of the upload's actual type." },
    rules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rule_number: {
            type: Type.STRING,
            description:
              "Rule identifier verbatim from the document — e.g. '1', '2.3', 'A.5'. Preserve sub-numbering exactly.",
          },
          heading: {
            type: Type.STRING,
            nullable: true,
            description: "Section heading or rule title if present (e.g. 'Noise', 'Pets'). Null if rule is just numbered text.",
          },
          body: {
            type: Type.STRING,
            description: "Full rule text. Strip leading/trailing whitespace; preserve internal punctuation.",
          },
          page_number: {
            type: Type.INTEGER,
            nullable: true,
            description: "1-indexed PDF page where the rule starts.",
          },
          bbox: {
            type: Type.OBJECT,
            nullable: true,
            description: "Bounding box on `page_number` in normalised page coords (0-1). Null if not confidently locatable.",
            properties: {
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              w: { type: Type.NUMBER },
              h: { type: Type.NUMBER },
            },
            required: ["x", "y", "w", "h"],
          },
          confidence: { type: Type.NUMBER, description: "0-1 confidence in this row's extraction." },
        },
        required: ["rule_number", "body", "confidence"],
      },
    },
  },
  required: ["is_oc_rules", "document_type_guess", "rules"],
};

const SYSTEM_PROMPT = `You extract every numbered rule from a registered Victorian Owners Corporation rules PDF.

Rules:
- Return every rule the document defines, in source order.
- Preserve sub-numbering verbatim (e.g. "2.3.a" stays "2.3.a", NOT "2.3.1").
- Body text should be the full text of the rule, joined into one string. Drop only the leading rule number/heading.
- Use page_number to indicate where each rule starts (1-indexed).
- bbox: only set when you can confidently locate the rule on the page. Otherwise null.

Document-type gate:
- BEFORE extracting anything, decide whether this PDF actually IS a set of OC rules.
- If it's something else (plan of subdivision, insurance cert, levy notice, photo, contract, blank page, garbled OCR), set is_oc_rules=false, document_type_guess to your best one-line description, and return rules=[].
- When in doubt return false. The manager can re-upload.`;

type ServiceAccount = { project_id?: string; client_email?: string; private_key?: string };

function buildClient(): GoogleGenAI {
  const raw = process.env.GEMINI_API_KEY;
  if (!raw) {
    console.error("parseRulesPdf: GEMINI_API_KEY missing");
    throw new Error("Automatic rules parsing is temporarily unavailable.");
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    let credentials: ServiceAccount;
    try {
      credentials = JSON.parse(trimmed) as ServiceAccount;
    } catch {
      throw new Error("Automatic rules parsing is temporarily unavailable.");
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

export async function parseRulesPdf(pdfBytes: Buffer): Promise<ParsedRulesDocument> {
  const ai = buildClient();
  const result = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: [
      {
        role: "user",
        parts: [
          { text: "Extract every numbered rule from this Owners Corporation rules PDF." },
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
    console.error("parseRulesPdf: empty response from model");
    throw new Error("Automatic rules parsing returned no data.");
  }
  return JSON.parse(text) as ParsedRulesDocument;
}
