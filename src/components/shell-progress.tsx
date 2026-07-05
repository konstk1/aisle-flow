"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type ShellProgress = {
  checkedCount: number;
  totalCount: number;
};

const ShellProgressContext = createContext<{
  progress: ShellProgress | null;
  setProgress: (progress: ShellProgress | null) => void;
} | null>(null);

export function ShellProgressProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [progress, setProgress] = useState<ShellProgress | null>(null);
  const value = useMemo(() => ({ progress, setProgress }), [progress]);

  return (
    <ShellProgressContext.Provider value={value}>
      {children}
    </ShellProgressContext.Provider>
  );
}

export function useShellProgress(progress: ShellProgress | null) {
  const context = useContext(ShellProgressContext);
  const setProgress = context?.setProgress;
  const checkedCount = progress?.checkedCount ?? null;
  const totalCount = progress?.totalCount ?? null;

  useEffect(() => {
    if (!setProgress || checkedCount === null || totalCount === null) {
      return;
    }

    setProgress({ checkedCount, totalCount });

    return () => setProgress(null);
  }, [setProgress, checkedCount, totalCount]);
}

export function ShellProgressBar() {
  const context = useContext(ShellProgressContext);
  const progress = context?.progress ?? null;

  if (!progress) {
    return null;
  }

  const pct = progress.totalCount
    ? Math.round((progress.checkedCount / progress.totalCount) * 100)
    : 0;

  return (
    <div
      aria-label="Shopping progress"
      aria-valuemax={progress.totalCount}
      aria-valuemin={0}
      aria-valuenow={progress.checkedCount}
      className="absolute inset-x-0 bottom-0 h-[3px] bg-[#eceef4]"
      role="progressbar"
    >
      <div
        className="h-full rounded-r-full bg-gradient-to-r from-[#0a84ff] to-[#3b9dff] transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
