import { redirect } from "next/navigation";

// Public sign-up is disabled during the pre-launch waitlist period. Anyone
// landing here is bounced to the waitlist on the marketing landing page.
// Existing accounts continue to authenticate via /sign-in.
export default function SignUpDisabledPage() {
  redirect("/");
}
