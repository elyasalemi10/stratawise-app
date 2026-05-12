// Pure constants for company logo upload validation.
// Lives outside the "use server" sibling so client components can import them
// without triggering Next.js' "Server Actions must be async" build error.

export const ALLOWED_LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
] as const;

export const MAX_LOGO_BYTES = 1 * 1024 * 1024; // 1MB
export const MAX_LOGO_WIDTH = 800;
export const MAX_LOGO_HEIGHT = 400;
