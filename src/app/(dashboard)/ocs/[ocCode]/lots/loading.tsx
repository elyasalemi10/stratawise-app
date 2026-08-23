// Deliberately renders nothing.
//
// page.tsx is a shell: it resolves the OC code and fetches no page data, so
// there is nothing here worth covering with a skeleton. The skeleton belongs
// to LotsClient, which is the thing that actually knows whether there is
// cached data to show instead.
//
// Rendering the skeleton here as well caused two visible problems:
//   1. Two mounts of the same skeleton with a blank gap between them, because
//      <Skeleton>'s 200ms anti-flash delay restarts on each mount.
//   2. A skeleton flash when RETURNING to a page whose data is already in the
//      tab cache. loading.tsx runs while the server shell streams, before
//      LotsClient can paint from cache, so a cache hit still flashed.
//
// CLAUDE.md requires a loading.tsx on every route that does server work; this
// satisfies that while letting the client own the loading state.
export default function LotsLoading() {
  return null;
}
