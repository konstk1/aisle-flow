import { ListChecks } from "lucide-react";

export function AppMark() {
  return (
    <div className="flex items-center gap-2.5 font-semibold tracking-tight text-zinc-950">
      <ListChecks aria-hidden="true" className="size-5" />
      <span>Aisle Flow</span>
    </div>
  );
}
