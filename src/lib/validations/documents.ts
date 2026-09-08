import { z } from "zod";
import type { TagColour } from "@/lib/document-tags-shared";

export const renameDocumentSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
});

export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/rtf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
];

export const ALLOWED_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".odt", ".odp", ".ods", ".rtf",
  ".png", ".jpg", ".jpeg", ".webp",
  ".txt", ".csv",
];

export const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024; // 25MB

export interface DocumentRecord {
  id: string;
  oc_id: string;
  lot_id: string | null;
  category: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  is_confidential: boolean;
  uploaded_by: string | null;
  created_at: string;
  /** Office files are rendered to PDF so they can be previewed in the app and
   *  read by OCR. "skipped" means no rendition was needed (already a PDF or
   *  an image), which is different from one that has not been made yet. */
  pdf_status?: "none" | "pending" | "complete" | "failed" | "skipped";
  pdf_storage_key?: string | null;
  /** Small WebP for the grid. Null when the file has no page or image to
   *  make one from. */
  thumbnail_storage_key?: string | null;
  /** What the manager says this document is, in their words. The uploaded
   *  filename stays on original_filename: "scan_0043.pdf" identifies
   *  nothing, and the description is what makes it findable later. */
  description?: string | null;
  /** Resolved on the documents page fetch, not stored on the row. */
  tags?: Array<{ id: string; name: string; colour: TagColour }>;
}
