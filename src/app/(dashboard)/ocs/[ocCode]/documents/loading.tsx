// Deliberately renders nothing , see lots/loading.tsx for the full reasoning.
// page.tsx is a shell that fetches no data; the skeleton belongs to
// DocumentsClient, which knows whether there is cached data to show instead.
// Rendering it here too caused a double skeleton and a flash when returning
// to a page whose data was already cached.
export default function DocumentsLoading() {
  return null;
}
