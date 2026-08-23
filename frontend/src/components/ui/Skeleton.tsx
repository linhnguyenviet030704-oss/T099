import React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-slate-200 dark:bg-slate-700/60 rounded-xl ${className}`}
    />
  );
}

export function JobCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="w-11 h-11 rounded-xl shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="space-y-2 pt-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ))}
    </>
  );
}

export function ApplicationSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-3 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </>
  );
}
