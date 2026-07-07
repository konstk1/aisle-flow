import { ListChecks } from "lucide-react";

export function AppMark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-accent to-accent-bright text-white shadow-accent-glow">
        <ListChecks aria-hidden="true" className="size-5" />
      </span>
      <span className="text-lg font-bold tracking-tight">Aisle Flow</span>
    </div>
  );
}
