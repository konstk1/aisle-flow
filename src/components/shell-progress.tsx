"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ShellProgress = {
  checkedCount: number;
  totalCount: number;
};

type SetShellProgress = (progress: ShellProgress | null) => void;

// Split contexts so publishers subscribe only to the stable setter: a page
// reporting progress does not re-render when the value it just published
// changes — only ShellProgressBar consumes the value.
const ShellProgressValueContext = createContext<ShellProgress | null>(null);
const ShellProgressSetterContext = createContext<SetShellProgress | null>(
  null,
);

export function ShellProgressProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [progress, setProgress] = useState<ShellProgress | null>(null);

  return (
    <ShellProgressSetterContext.Provider value={setProgress}>
      <ShellProgressValueContext.Provider value={progress}>
        {children}
      </ShellProgressValueContext.Provider>
    </ShellProgressSetterContext.Provider>
  );
}

export function useShellProgress(progress: ShellProgress | null) {
  const setProgress = useContext(ShellProgressSetterContext);
  const checkedCount = progress?.checkedCount ?? null;
  const totalCount = progress?.totalCount ?? null;

  useEffect(() => {
    if (!setProgress) {
      return;
    }

    setProgress(
      checkedCount === null || totalCount === null || totalCount === 0
        ? null
        : { checkedCount, totalCount },
    );
  }, [setProgress, checkedCount, totalCount]);

  useEffect(() => {
    if (!setProgress) {
      return;
    }

    return () => setProgress(null);
  }, [setProgress]);
}

// Reserves room below the sticky header for the count pill hanging off the
// progress bar, so it does not overlap the first row of page content. Pages
// that publish progress render this above their content, keyed off SSR-known
// page data — the progress context is only populated in a post-hydration
// effect, so keying off it would shift the page down after first paint.
// h-5 matches the pill height in ShellProgressBar.
export function ShellProgressSpacer() {
  return <div aria-hidden="true" className="h-5" />;
}

export function ShellProgressBar() {
  const progress = useContext(ShellProgressValueContext);

  if (!progress) {
    return null;
  }

  const pct = Math.round((progress.checkedCount / progress.totalCount) * 100);
  const isComplete = progress.checkedCount >= progress.totalCount;

  return (
    <div
      aria-label="Shopping progress"
      aria-valuemax={progress.totalCount}
      aria-valuemin={0}
      aria-valuenow={progress.checkedCount}
      className="absolute inset-x-0 bottom-0 h-[3px] bg-divider"
      role="progressbar"
    >
      <div
        className={`h-full rounded-r-full bg-gradient-to-r transition-[width] duration-300 ${
          isComplete
            ? "from-success to-success-bright"
            : "from-accent to-accent-bright"
        }`}
        style={{ width: `${pct}%` }}
      />
      <div
        className="pointer-events-none absolute left-0 top-full flex min-w-fit justify-end transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      >
        {/* h-5 matches ShellProgressSpacer, which reserves this pill's space. */}
        <span
          className={`flex h-5 items-center rounded-b-lg px-2.5 text-xs font-bold text-white ${
            isComplete
              ? "bg-success shadow-success-glow"
              : "bg-accent shadow-accent-glow"
          }`}
        >
          {progress.checkedCount} / {progress.totalCount}
        </span>
      </div>
    </div>
  );
}
