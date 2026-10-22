import React, { useEffect } from "react";
import { X } from "lucide-react";

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
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl",
  }[maxWidth];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Restrained Backdrop (40% black, NO blur) */}
      <div
        className="fixed inset-0 bg-black/40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Surface */}
      <div
        className={`relative z-10 w-full rounded-md border border-border bg-background-primary p-5 sm:p-6 shadow-md ${maxStyles}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-text-primary">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-xs text-text-secondary">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-text-muted hover:bg-background-tertiary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4">{children}</div>

        {footer && (
          <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-border-light pt-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
