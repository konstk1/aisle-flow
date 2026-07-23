"use client";

import { Bot } from "lucide-react";
import { createPortal } from "react-dom";

export function AiCategorizingOverlay() {
  return createPortal(
    <div
      aria-label="Categorizing items"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/30 px-4"
      role="dialog"
    >
      <div className="rounded-card shadow-card flex w-full max-w-70 flex-col items-center bg-white px-6 py-7">
        <div className="bg-accent-50 flex size-14 items-center justify-center rounded-full">
          <Bot
            aria-hidden="true"
            className="text-accent animate-bot-bob size-7"
          />
        </div>
        <p className="text-ink-700 mt-4 text-base font-semibold" role="status">
          Categorizing your items…
        </p>
        <div aria-hidden="true" className="mt-2.5 flex gap-1.5">
          {[0, 1, 2].map((index) => (
            <span
              className="bg-accent size-1.5 animate-bounce rounded-full"
              key={index}
              style={{ animationDelay: `${index * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
