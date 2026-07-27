import type { StoreSummary } from "@/domain/stores";

import { AppNav } from "@/components/app-nav";
import { FeedbackButton } from "@/components/feedback-button";
import {
  ShellProgressBar,
  ShellProgressProvider,
} from "@/components/shell-progress";
import { StorePicker } from "@/components/store-picker";

export function AppShell({
  children,
  currentStoreId,
  stores,
}: {
  children: React.ReactNode;
  currentStoreId: string | null;
  stores: StoreSummary[];
}) {
  return (
    <ShellProgressProvider>
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 pb-20">
        <header className="sticky top-0 z-20 -mx-6 bg-background/80 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <AppNav />
            <StorePicker currentStoreId={currentStoreId} stores={stores} />
          </div>
          <ShellProgressBar />
        </header>
        {children}
        <FeedbackButton />
      </main>
    </ShellProgressProvider>
  );
}
