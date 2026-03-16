import { Skeleton } from "@/components/ui/skeleton";

export function KPICardSkeleton({ promoted = false }: { promoted?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className={promoted ? "h-10 w-28" : "h-8 w-24"} />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-sm space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="flex items-end gap-2 h-64">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-md"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function FilterSkeleton() {
  return (
    <div className="flex flex-wrap items-end gap-4 p-4 bg-card rounded-lg border border-border">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-9 w-full sm:w-[200px]" />
      <Skeleton className="h-9 w-full sm:w-[200px]" />
      <Skeleton className="h-9 w-full sm:w-[200px]" />
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3 border-t border-border">
          <Skeleton className="h-4 flex-[2]" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICardSkeleton promoted />
        <KPICardSkeleton promoted />
        <KPICardSkeleton promoted />
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
      </section>
      <FilterSkeleton />
      <ChartSkeleton />
      <TableSkeleton />
    </div>
  );
}
