import { AppNav } from "@/components/app-nav";
import { FeedbackButton } from "@/components/feedback-button";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-6 sm:px-8 sm:py-10">
      <header>
        <div className="flex items-center justify-between gap-4">
          <AppNav />
          <form action="/api/auth/logout" method="post">
            <button
              className="text-sm text-zinc-500 underline-offset-4 hover:underline"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
      <FeedbackButton />
    </main>
  );
}
