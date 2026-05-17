import { SignUpForm } from "../../_components/sign-up-form";

// Public sign-up. Reachable from the sign-in page footer ("Create an
// account") and via direct link from the marketing site. Middleware bounces
// signed-in users away to /dashboard so an authenticated visitor never sees
// this page.
export default function SignUpPage() {
  return <SignUpForm />;
}
