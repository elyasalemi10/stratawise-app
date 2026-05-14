// Server-component layout for /ocs/new. Sole purpose is to set the route
// segment's maxDuration so the wizard's long-running server actions
// (rules PDF parsing via Gemini, plan-of-subdivision OCR + parse, CoC
// extraction) get the full 300 seconds on Vercel Pro before the platform
// kills the function.
//
// Vercel's defaults: hobby = 10s, Pro = 60s, Pro can opt into 300s. The
// rules parser routinely takes 60–180s on long custom-rules PDFs, and
// Document AI OCR on a 50-page plan can run 30–60s. Without this, those
// actions get truncated mid-flight and the user sees a generic "failed".

export const maxDuration = 300;

export default function NewOCLayout({ children }: { children: React.ReactNode }) {
  return children;
}
