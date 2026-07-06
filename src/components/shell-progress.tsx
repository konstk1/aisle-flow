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

export function ShellProgressBar() {
  const progress = useContext(ShellProgressValueContext);

  if (!progress) {
    return null;
  }

  const pct = Math.round((progress.checkedCount / progress.totalCount) * 100);

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
        className="h-full rounded-r-full bg-gradient-to-r from-accent to-accent-bright transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
