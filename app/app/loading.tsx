import { HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/**
 * The fallback for `/app` itself, and for any segment beneath it that has not
 * declared a shape of its own.
 *
 * Deliberately the plainest of them. `/app` is a router — it looks up the
 * project with an active sprint and redirects — so this is on screen for the
 * length of one redirect. It is also, being the outermost boundary, carried in
 * the flight payload of every single screen in the app, which is the reason it
 * is a header and one painted block rather than a drawing of a sprint page.
 */
export default function Loading() {
  return (
    <LoadingScreen label="Loading">
      <HeaderSkeleton />
      <ListSkeleton rows={8} rowHeight={52} header={false} />
    </LoadingScreen>
  );
}
