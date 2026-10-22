import React, { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: Array<{ value: string | number; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      children,
      id,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-medium text-text-primary"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            className={`w-full appearance-none rounded border bg-background-primary py-2 pl-3 pr-8 text-xs sm:text-sm text-text-primary outline-none transition-colors duration-150 disabled:bg-background-tertiary disabled:opacity-60 cursor-pointer ${
              error
                ? "border-status-error focus:border-status-error focus:ring-1 focus:ring-status-error"
                : "border-border hover:border-card-border-hover focus:border-border-focus focus:ring-1 focus:ring-border-focus"
            } ${className}`.trim()}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <span className="pointer-events-none absolute right-2.5 text-text-muted">
            <ChevronDown size={14} />
          </span>
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-status-error">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={helperId} className="text-xs text-text-muted">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
