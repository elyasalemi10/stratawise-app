// What a file is, drawn, for cards that have no page to show.
//
// The alternative was a grey plate reading "DOCX" or "MP3". An extension is
// a filename detail, not a thing: it tells you what opens the file, not what
// the file is, and a grid of them reads as a list of errors. A drawing of a
// sheet of paper, a spreadsheet, a waveform or a frame of film says the same
// in the language the rest of the empty states already use.
//
// Same palette contract as empty-illustration.tsx: --muted ground, --border
// line work, exactly ONE --brand-gold element, never --primary.

export type FileKind =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "audio"
  | "video"
  | "archive"
  | "generic";

/** Map a mime type and filename to something we can draw. */
export function fileKindFor(mimeType: string | null | undefined, fileName: string): FileKind {
  const m = (mimeType ?? "").toLowerCase();
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";

  if (m.startsWith("audio/") || ["mp3", "m4a", "wav", "aac", "flac"].includes(ext)) return "audio";
  if (m.startsWith("video/") || ["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (m.includes("spreadsheet") || m === "text/csv" || ["xlsx", "xls", "csv", "ods"].includes(ext)) {
    return "spreadsheet";
  }
  if (m.includes("presentation") || ["pptx", "ppt", "odp"].includes(ext)) return "presentation";
  if (m.includes("zip") || m.includes("compressed") || ["zip", "rar", "7z"].includes(ext)) {
    return "archive";
  }
  if (
    m === "application/pdf" ||
    m.includes("word") ||
    m === "text/plain" ||
    ["pdf", "docx", "doc", "odt", "rtf", "txt"].includes(ext)
  ) {
    return "document";
  }
  return "generic";
}

const GROUND = "var(--muted)";
const LINE = "var(--border)";
const GOLD = "var(--brand-gold)";

function Sheet({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <path
        d="M18 8h26l14 14v42a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z"
        fill={GROUND}
        stroke={LINE}
        strokeWidth="2"
      />
      <path d="M44 8v14h14" fill="none" stroke={LINE} strokeWidth="2" />
      {children}
    </>
  );
}

const DRAWINGS: Record<FileKind, React.ReactNode> = {
  document: (
    <Sheet>
      <rect x="23" y="34" width="26" height="2.5" rx="1.25" fill={LINE} />
      <rect x="23" y="42" width="26" height="2.5" rx="1.25" fill={LINE} />
      <rect x="23" y="50" width="16" height="2.5" rx="1.25" fill={GOLD} />
    </Sheet>
  ),
  spreadsheet: (
    <Sheet>
      <rect x="23" y="33" width="26" height="21" rx="2" fill="none" stroke={LINE} strokeWidth="2" />
      <path d="M23 40h26M23 47h26M36 33v21" stroke={LINE} strokeWidth="2" />
      <rect x="24" y="34" width="11" height="5" fill={GOLD} opacity="0.55" />
    </Sheet>
  ),
  presentation: (
    <Sheet>
      <rect x="23" y="33" width="26" height="17" rx="2" fill="none" stroke={LINE} strokeWidth="2" />
      <path d="M27 46l6-7 4 5 3-3 5 5" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <rect x="32" y="54" width="8" height="2" rx="1" fill={LINE} />
    </Sheet>
  ),
  audio: (
    <Sheet>
      {/* A waveform, centred on the sheet. */}
      <g stroke={LINE} strokeWidth="2.5" strokeLinecap="round">
        <path d="M23 44v-4" />
        <path d="M28 47v-10" />
        <path d="M33 50v-16" />
        <path d="M43 47v-10" />
        <path d="M48 44v-4" />
      </g>
      <path d="M38 52V32" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" />
    </Sheet>
  ),
  video: (
    <Sheet>
      <rect x="23" y="34" width="26" height="18" rx="2" fill="none" stroke={LINE} strokeWidth="2" />
      <path d="M33 39.5v7l7-3.5z" fill={GOLD} />
    </Sheet>
  ),
  archive: (
    <Sheet>
      <rect x="33" y="30" width="6" height="4" fill={LINE} />
      <rect x="33" y="36" width="6" height="4" fill={LINE} />
      <rect x="33" y="42" width="6" height="4" fill={GOLD} />
      <rect x="31" y="49" width="10" height="9" rx="2" fill="none" stroke={LINE} strokeWidth="2" />
    </Sheet>
  ),
  generic: (
    <Sheet>
      <circle cx="36" cy="44" r="8" fill="none" stroke={LINE} strokeWidth="2" />
      <path d="M36 40v5" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="36" cy="49" r="1.4" fill={GOLD} />
    </Sheet>
  ),
};

export function FileTypeIllustration({
  kind,
  className,
}: {
  kind: FileKind;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 72 72" className={className} aria-hidden>
      {DRAWINGS[kind]}
    </svg>
  );
}

/**
 * The short name for a file's type, for the caption under a drawing.
 *
 * The extension, uppercased, because that is what the manager called the
 * file when they saved it: they know which one is the XLSX. Where the
 * filename has no extension the mime type is asked instead, and where
 * neither says anything useful the caption is left off rather than filled
 * with "FILE".
 */
export function fileTypeLabel(
  mimeType: string | null | undefined,
  fileName: string,
): string | null {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.trim() : "";
  if (ext && ext.length <= 5 && /^[a-z0-9]+$/i.test(ext)) return ext.toUpperCase();

  const m = (mimeType ?? "").toLowerCase();
  const FROM_MIME: Record<string, string> = {
    "application/pdf": "PDF",
    "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.ms-excel": "XLS",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "application/vnd.ms-powerpoint": "PPT",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "text/csv": "CSV",
    "text/plain": "TXT",
    "application/zip": "ZIP",
  };
  if (FROM_MIME[m]) return FROM_MIME[m];

  const sub = m.split("/")[1];
  if (sub && sub.length <= 5 && /^[a-z0-9]+$/.test(sub)) return sub.toUpperCase();
  return null;
}
