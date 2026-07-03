import { RefObject, useEffect } from "react";

export function useDialogFocusTrap({
  dialogRef,
  initialFocusRef,
  onClose,
}: {
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  useEffect(() => {
    initialFocusRef?.current?.focus();

    function handleDialogKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
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
  }, [dialogRef, initialFocusRef, onClose]);
}
