"use client";

import { useCallback, useSyncExternalStore } from "react";

const ARCHIVE_CHANGED_EVENT = "shopping-list-archive-changed";
const memoryCutoffs = new Map<string, number>();
const serverCutoff = () => null;
const storageKey = (listId: string) => `aisle-flow:archive-cutoff:${listId}`;

export function readArchiveCutoff(listId: string): number | null {
  const memoryCutoff = memoryCutoffs.get(listId);
  if (memoryCutoff !== undefined) return memoryCutoff;
  try {
    const value = window.localStorage.getItem(storageKey(listId));
    if (value === null) return null;
    const cutoff = Number(value);
    return Number.isFinite(cutoff) && cutoff > 0 ? cutoff : null;
  } catch {
    return memoryCutoffs.get(listId) ?? null;
  }
}

export function saveArchiveCutoff(listId: string, cutoff: number) {
  try {
    window.localStorage.setItem(storageKey(listId), String(cutoff));
    memoryCutoffs.delete(listId);
  } catch {
    // Keep the action usable in this session if browser storage is unavailable.
    memoryCutoffs.set(listId, cutoff);
  }
  window.dispatchEvent(new Event(ARCHIVE_CHANGED_EVENT));
}

export function subscribeToArchiveCutoff(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(ARCHIVE_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ARCHIVE_CHANGED_EVENT, onChange);
  };
}

export function useShoppingListArchive(listId: string | undefined) {
  const getCutoff = useCallback(
    () => (listId ? readArchiveCutoff(listId) : null),
    [listId],
  );
  const cutoff = useSyncExternalStore(
    subscribeToArchiveCutoff,
    getCutoff,
    serverCutoff,
  );
  const archiveCompleted = () => {
    if (listId) saveArchiveCutoff(listId, Date.now());
  };
  return { cutoff, archiveCompleted };
}
