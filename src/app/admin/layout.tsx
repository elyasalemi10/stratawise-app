// Root /admin layout — intentionally a passthrough. The console chrome
// (sidebar + header) lives in the (console) route group so it ONLY wraps
// real admin pages. The MFA enrol / challenge pages sit directly under
// /admin and therefore render bare — a user who hasn't finished MFA has no
// sidebar to navigate away from.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
