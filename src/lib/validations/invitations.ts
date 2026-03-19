import { z } from "zod";

export const inviteLotOwnerSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  role: z.enum(["lot_owner", "lot_owner"]).default("lot_owner"),
});

export const inviteStrataManagerSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().min(1, "Name is required"),
});

export type InviteLotOwnerValues = z.infer<typeof inviteLotOwnerSchema>;
export type InviteStrataManagerValues = z.infer<typeof inviteStrataManagerSchema>;
