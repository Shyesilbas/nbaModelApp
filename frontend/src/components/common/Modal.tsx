import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../../context/useLanguage";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "md",
}) => {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.setAttribute("closedby", "any");
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Fallback click-outside light-dismiss for browsers without native `closedby="any"` (e.g. Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen || "closedBy" in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl",
  }[maxWidth];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : t.common.close}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      className={`m-auto w-full rounded-md border border-border bg-background-primary p-5 text-text-primary shadow-md sm:p-6 ${maxStyles}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          {title && (
            <h2 id={titleId} className="text-base font-semibold text-text-primary">
              {title}
            </h2>
          )}
          {description && (
            <p id={descId} className="mt-1 text-xs text-text-secondary">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={t.common.close}
          className="cursor-pointer rounded p-1 text-text-muted hover:bg-background-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4">{children}</div>

      {footer && (
        <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-border-light pt-4">
          {footer}
        </div>
      )}
    </dialog>
  );
};
