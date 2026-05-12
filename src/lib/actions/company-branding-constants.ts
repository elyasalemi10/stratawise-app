// Pure constants for company logo upload validation.
// Lives outside the "use server" sibling so client components can import them
// without triggering Next.js' "Server Actions must be async" build error.

// Accepted formats — we let users upload essentially anything modern browsers
// can encode + display. HEIC is from iPhone photos; the browser/OS usually
// re-encodes to JPEG on selection but we accept the raw type just in case.
export const ALLOWED_LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/bmp",
  "image/heic",
  "image/heif",
] as const;

export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB (lifted from 1MB)
export const MAX_LOGO_WIDTH = 1200;            // raised from 800 for higher-DPI logos
export const MAX_LOGO_HEIGHT = 600;            // raised from 400
