import { Skeleton } from '@/components/ui/skeleton';

/** Route-group loading UI: mirrors the KPI + grid page skeleton. */
export default function AppLoading() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="min-h-0 flex-1 rounded-xl" />
    </div>
  );
}
