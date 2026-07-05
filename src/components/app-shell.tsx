import type { StoreSummary } from "@/domain/stores";

import { AppNav } from "@/components/app-nav";
import { FeedbackButton } from "@/components/feedback-button";
import {
  ShellProgressBar,
  ShellProgressProvider,
} from "@/components/shell-progress";
import { SignOutButton } from "@/components/sign-out-button";
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
        <header className="sticky top-0 z-20 -mx-6 bg-[#f4f6fb]/80 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <AppNav />
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <StorePicker currentStoreId={currentStoreId} stores={stores} />
              <SignOutButton />
            </div>
          </div>
          <ShellProgressBar />
        </header>
        {children}
        <FeedbackButton />
      </main>
    </ShellProgressProvider>
  );
}
