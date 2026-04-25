import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <div className="flex flex-col gap-2 flex-1">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3, columns = 3 }: { count?: number; columns?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-6 flex flex-col gap-3">
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-8 w-2/5" />
        </div>
      ))}
    </div>
  );
}
