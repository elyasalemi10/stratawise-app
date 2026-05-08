import { z } from "zod";

// Owner-details form. Used for both saving owner contact info on a lot
// (no email send) and sending an invitation. The "Save & invite" path
// re-validates with `inviteSendSchema` so email is required only at
// send time — saving partial details (e.g. just a name) is allowed.
export const lotOwnerDetailsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  role: z.literal("lot_owner").default("lot_owner"),
});

export const inviteSendSchema = lotOwnerDetailsSchema.extend({
  email: z.string().email("Email is required to send an invitation"),
});

export const inviteStrataManagerSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().min(1, "Name is required"),
});

export type LotOwnerDetailsValues = z.infer<typeof lotOwnerDetailsSchema>;
export type InviteSendValues = z.infer<typeof inviteSendSchema>;
export type InviteStrataManagerValues = z.infer<typeof inviteStrataManagerSchema>;
