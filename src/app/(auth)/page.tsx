import { SignInForm } from "./_components/sign-in-form";

// Canonical login URL — "/". Middleware bounces signed-in users away to
// /dashboard before this component renders, so any unauthed visitor to the
// app's root lands on the login form directly.
export default function RootSignInPage() {
  return <SignInForm />;
}
