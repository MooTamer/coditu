import { Bar, HeaderSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** Header, then the drop panel at the height it actually occupies. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading the importer">
      <HeaderSkeleton wide />
      <Bar w="100%" h={200} className="rounded-list" />
    </LoadingScreen>
  );
}
