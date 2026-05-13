// Macquarie PAY file parser — STUB.
//
// PAY files carry consolidated settlement records back to the customer
// (Macquarie's confirmation of an outgoing batch payment run we submitted).
// The byte-position spec for PAY isn't openly published; we'd need either a
// sample file from a real Macquarie account or the official integration PDF
// to implement this safely.
//
// For now: detect the format (so users get a clear "PAY isn't supported yet"
// message instead of a TXN parser tripping silently) and return.

export type ParsedPayFile = {
  recognised: false;
  reason: string;
};

const PAY_FILENAME_RE = /\.pay$/i;

export function looksLikePayFile(filename: string): boolean {
  return PAY_FILENAME_RE.test(filename);
}

export function parsePayFile(_input: string | Buffer): ParsedPayFile {
  return {
    recognised: false,
    reason:
      "PAY file ingest isn't supported yet. Upload your TXN file instead — " +
      "PAY parsing arrives in a follow-up release.",
  };
}
