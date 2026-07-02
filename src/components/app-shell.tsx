import type { StoreSummary } from "@/domain/stores";

import { AppNav } from "@/components/app-nav";
import { FeedbackButton } from "@/components/feedback-button";
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
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-6 sm:px-8 sm:py-10">
      <header>
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <AppNav />
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <StorePicker currentStoreId={currentStoreId} stores={stores} />
            <SignOutButton />
          </div>
        </div>
      </header>
      {children}
      <FeedbackButton />
    </main>
  );
}
