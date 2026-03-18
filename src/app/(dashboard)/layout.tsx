export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar will be added in Phase 1 */}
      <main className="flex-1 bg-background px-6 py-6">{children}</main>
    </div>
  );
}
