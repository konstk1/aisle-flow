import { AppNav } from "@/components/app-nav";
import { FeedbackButton } from "@/components/feedback-button";
import { SignOutButton } from "@/components/sign-out-button";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-6 sm:px-8 sm:py-10">
      <header>
        <div className="flex items-center justify-between gap-4">
          <AppNav />
          <SignOutButton />
        </div>
      </header>
      {children}
      <FeedbackButton />
    </main>
  );
}
