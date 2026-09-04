// Tag vocabulary for documents. Outside the "use server" boundary so client
// components can import the colours; see insurance-shared.ts for why that
// distinction is load-bearing.

export type TagColour =
  | "slate" | "blue" | "green" | "amber" | "red" | "purple" | "pink" | "teal";

export const TAG_COLOURS: TagColour[] = [
  "slate", "blue", "green", "amber", "red", "purple", "pink", "teal",
];

/** Classes for a tag chip. Fixed strings, because Tailwind cannot see a
 *  class name that is assembled at runtime. */
export const TAG_COLOUR_CLASS: Record<TagColour, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-100 text-blue-700 ring-blue-200",
  green: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  red: "bg-red-100 text-red-700 ring-red-200",
  purple: "bg-violet-100 text-violet-700 ring-violet-200",
  pink: "bg-pink-100 text-pink-700 ring-pink-200",
  teal: "bg-teal-100 text-teal-700 ring-teal-200",
};

/** The dot in the colour picker. */
export const TAG_COLOUR_DOT: Record<TagColour, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  purple: "bg-violet-500",
  pink: "bg-pink-500",
  teal: "bg-teal-500",
};

export const TAG_COLOUR_LABEL: Record<TagColour, string> = {
  slate: "Grey",
  blue: "Blue",
  green: "Green",
  amber: "Amber",
  red: "Red",
  purple: "Purple",
  pink: "Pink",
  teal: "Teal",
};

export function randomTagColour(): TagColour {
  return TAG_COLOURS[Math.floor(Math.random() * TAG_COLOURS.length)];
}

export interface DocumentTag {
  id: string;
  name: string;
  colour: TagColour;
}

/**
 * What a strata office files things under, so the list is useful on day one
 * rather than an empty box. Seeded per company the first time tags are read.
 */
export const DEFAULT_TAGS: Array<{ name: string; colour: TagColour }> = [
  { name: "Insurance COC", colour: "blue" },
  { name: "Insurance policy", colour: "blue" },
  { name: "Minutes", colour: "purple" },
  { name: "Agenda", colour: "purple" },
  { name: "Levy notice", colour: "green" },
  { name: "Invoice", colour: "amber" },
  { name: "Quote", colour: "amber" },
  { name: "Contract", colour: "teal" },
  { name: "Plan of subdivision", colour: "slate" },
  { name: "OC rules", colour: "slate" },
  { name: "Compliance", colour: "red" },
  { name: "Maintenance", colour: "pink" },
  { name: "Correspondence", colour: "slate" },
  { name: "Financials", colour: "green" },
];
