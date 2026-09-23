"use client";

import { useState } from "react";

type ModeratorLoginFormProps = {
  onSuccess: () => void;
  onCancel: () => void;
};

/** Asks for the moderator code. The real code never appears in this file. */
export function ModeratorLoginForm({ onSuccess, onCancel }: ModeratorLoginFormProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }

      onSuccess();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center"
      onClick={onCancel}
    >
      <form
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <h2 className="text-lg font-semibold text-stone-950">Login as a moderator</h2>
        <p className="mt-1 text-sm font-medium text-stone-700">
          Enter the shared moderator code. It is checked on the server — inspecting this
          page will not reveal it.
        </p>

        <label
          className="mt-4 block text-sm font-semibold text-stone-900"
          htmlFor="moderator-code"
        >
          Moderator code
        </label>
        <input
          id="moderator-code"
          autoFocus
          type="password"
          autoComplete="current-password"
          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-base outline-none ring-stone-800 focus:ring-2"
          placeholder="••••••••"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={busy}
        />

        {error ? (
          <p className="mt-2 text-sm font-semibold text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="flex-1 rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Log in"}
          </button>
          <button
            type="button"
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
