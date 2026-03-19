import { z } from "zod";

export const renameDocumentSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
});

export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
];

export const ALLOWED_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".png", ".jpg", ".jpeg", ".webp",
  ".txt", ".csv",
];

export const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024; // 25MB

export interface DocumentRecord {
  id: string;
  subdivision_id: string;
  lot_id: string | null;
  category: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  is_confidential: boolean;
  uploaded_by: string | null;
  created_at: string;
}
