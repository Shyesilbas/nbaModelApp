import React, { forwardRef } from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      hoverable = false,
      padding = "md",
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const paddingStyles = {
      none: "",
      sm: "p-3",
      md: "p-4 sm:p-5",
      lg: "p-6",
    }[padding];

    const hoverStyles = hoverable
      ? "hover:border-card-border-hover transition-colors duration-150 cursor-pointer"
      : "";

    return (
      <div
        ref={ref}
        className={`rounded border border-border bg-background-primary ${paddingStyles} ${hoverStyles} ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
