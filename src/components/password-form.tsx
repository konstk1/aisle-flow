"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/auth/client";

export function PasswordForm({
  mode,
  email = "",
  nextPath = "/",
}: {
  mode: "login" | "set";
  email?: string;
  nextPath?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    setError(null);
    setSaved(false);
    if (mode === "set" && password !== data.get("confirmation")) {
      setError("The passwords don’t match.");
      return;
    }
    setPending(true);
    try {
      if (mode === "login") {
        const result = await authClient.signIn.email({
          email: String(data.get("email") ?? "")
            .trim()
            .toLowerCase(),
          password,
        });
        if (result.error) {
          setError(
            result.error.status === 429
              ? "Too many attempts. Please try again shortly."
              : "Unable to sign in. Check your email and password.",
          );
          return;
        }
        window.location.assign(nextPath);
      } else {
        const response = await fetch("/api/auth/set-app-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: password }),
        });
        if (!response.ok) {
          setError(
            response.status === 401 || response.status === 403
              ? "Sign in with Google to set your password."
              : "Unable to save your password. Please try again.",
          );
          return;
        }
        form.reset();
        setSaved(true);
      }
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-xl border border-divider bg-white px-3 py-3 text-base focus-visible:outline-accent";
  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="text-ink-700 block text-sm font-medium">
        Email
        <input
          autoComplete="username"
          className={inputClass}
          defaultValue={email}
          name="email"
          readOnly={mode === "set"}
          required
          type="email"
        />
      </label>
      <label className="text-ink-700 block text-sm font-medium">
        {mode === "set" ? "New password" : "Password"}
        <input
          autoComplete={mode === "set" ? "new-password" : "current-password"}
          className={inputClass}
          minLength={mode === "set" ? 8 : undefined}
          maxLength={128}
          name="password"
          required
          type="password"
        />
      </label>
      {mode === "set" && (
        <>
          <p className="text-ink-400 text-sm">Use at least 8 characters.</p>
          <label className="text-ink-700 block text-sm font-medium">
            Confirm password
            <input
              autoComplete="new-password"
              className={inputClass}
              name="confirmation"
              required
              type="password"
              maxLength={128}
            />
          </label>
        </>
      )}
      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-ink-700 text-sm" role="status">
          Password saved. You can now sign in with your email and this password.
        </p>
      )}
      <button
        className="bg-accent min-h-11 w-full rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending
          ? mode === "set"
            ? "Saving…"
            : "Signing in…"
          : mode === "set"
            ? "Set password"
            : "Sign in"}
      </button>
    </form>
  );
}
