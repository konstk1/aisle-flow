"use client";

import {
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Send,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import { FEEDBACK_TEXT_MAX_LENGTH } from "@/services/feedback-constants";

type FieldErrors = Record<string, string[]>;

type FeedbackResponse = {
  error?: string;
  fieldErrors?: FieldErrors;
  issue?: {
    number: number;
    url: string;
  };
};

function viewportPayload() {
  return {
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight),
    devicePixelRatio: window.devicePixelRatio,
  };
}

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [createdIssue, setCreatedIssue] = useState<
    FeedbackResponse["issue"] | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    textareaRef.current?.focus();

    function handleDialogKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeModal();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      const activeElement = document.activeElement;

      if (!firstElement || !lastElement) {
        return;
      }

      if (
        !(activeElement instanceof HTMLElement) ||
        !dialogRef.current?.contains(activeElement)
      ) {
        event.preventDefault();
        firstElement.focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeydown);

    return () => document.removeEventListener("keydown", handleDialogKeydown);
  }, [isOpen]);

  function openModal() {
    setIsOpen(true);
    setFieldErrors({});
    setMessage(null);
    setCreatedIssue(null);
  }

  function closeModal() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFieldErrors({});
    setMessage(null);
    setCreatedIssue(null);

    try {
      const response = await fetch("/api/feedback", {
        body: JSON.stringify({
          text,
          pageUrl: window.location.href,
          viewport: viewportPayload(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as FeedbackResponse;

      if (!response.ok || !result.issue) {
        setFieldErrors(result.fieldErrors ?? {});
        setMessage(result.error ?? "Feedback could not be submitted.");
        return;
      }

      setText("");
      setCreatedIssue(result.issue);
      setMessage(null);
    } catch {
      setMessage("Feedback could not be submitted. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const textError = fieldErrors.text?.[0];
  const nonTextErrors = Object.entries(fieldErrors)
    .filter(([field]) => field !== "text")
    .flatMap(([, errors]) => errors);

  return (
    <>
      <button
        aria-label="Send feedback"
        className="fixed right-4 bottom-4 z-30 inline-flex size-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition hover:border-zinc-300 hover:text-zinc-950 focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:outline-none sm:right-6 sm:bottom-6"
        onClick={openModal}
        ref={triggerRef}
        type="button"
      >
        <MessageSquare aria-hidden="true" className="size-4" />
      </button>

      {isOpen ? (
        <div
          aria-labelledby="feedback-title"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/30 px-4 py-5 sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
          role="dialog"
        >
          <form
            className="w-full max-w-md rounded-md border bg-white p-5 shadow-xl"
            onSubmit={submitFeedback}
            ref={dialogRef}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  className="text-base font-semibold text-zinc-950"
                  id="feedback-title"
                >
                  Send feedback
                </h2>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  Send a short note from this page.
                </p>
              </div>
              <button
                aria-label="Close feedback dialog"
                className="inline-flex size-8 shrink-0 items-center justify-center text-zinc-500 transition hover:text-zinc-950 focus:ring-2 focus:ring-zinc-300 focus:outline-none"
                onClick={closeModal}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <label className="mt-5 block text-sm font-medium text-zinc-800">
              What would you like to share?
              <textarea
                className="mt-2 min-h-32 w-full resize-y rounded-md border bg-white px-3 py-2 text-base text-zinc-950 shadow-sm transition outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                disabled={isSubmitting}
                maxLength={FEEDBACK_TEXT_MAX_LENGTH}
                onChange={(event) => setText(event.target.value)}
                ref={textareaRef}
                required
                value={text}
              />
            </label>
            <div className="mt-2 flex items-start justify-between gap-3 text-xs">
              {textError ? (
                <p className="text-red-700" role="alert">
                  {textError}
                </p>
              ) : (
                <span className="text-zinc-500">
                  {text.length}/{FEEDBACK_TEXT_MAX_LENGTH}
                </span>
              )}
            </div>

            {message ? (
              <div
                aria-live="polite"
                className="mt-4 flex gap-2 text-sm leading-6 text-red-700"
                role="alert"
              >
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <div>
                  <p>{message}</p>
                  {nonTextErrors.length > 0 ? (
                    <ul className="mt-1 list-disc pl-4">
                      {nonTextErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ) : null}

            {createdIssue ? (
              <p
                aria-live="polite"
                className="mt-4 flex gap-2 text-sm leading-6 text-emerald-700"
              >
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>
                  Created{" "}
                  <a
                    className="font-medium underline-offset-4 hover:underline"
                    href={createdIssue.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    issue #{createdIssue.number}
                  </a>
                  .
                </span>
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                className="min-h-10 px-3 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"
                onClick={closeModal}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                type="submit"
              >
                <Send aria-hidden="true" className="size-4" />
                {isSubmitting ? "Sending" : "Send"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
