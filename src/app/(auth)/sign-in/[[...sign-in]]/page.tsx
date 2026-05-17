import { SignInForm } from "../../_components/sign-in-form";

// Legacy route kept alive for bookmarks + the post-redirect URLs scattered
// across the app. The canonical login is now "/" (also rendered by the auth
// layout via src/app/(auth)/page.tsx).
export default function SignInPage() {
  return <SignInForm />;
}
