import { z } from "zod";

export const consentSchema = z.object({
  termsAccepted: z.literal(true, {
    error: "You must accept the Terms of Service",
  }),
  privacyAccepted: z.literal(true, {
    error: "You must accept the Privacy Policy",
  }),
});

export type ConsentFormValues = z.infer<typeof consentSchema>;
