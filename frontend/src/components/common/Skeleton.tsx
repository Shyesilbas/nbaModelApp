import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "rectangular" | "circular";
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = "rectangular",
  width,
  height,
  className = "",
  style,
  ...props
}) => {
  const variantStyles = {
    text: "h-3.5 w-full rounded-sm",
    rectangular: "rounded",
    circular: "rounded-full",
  }[variant];

  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-background-tertiary ${variantStyles} ${className}`.trim()}
      style={{
        width,
        height,
        ...style,
      }}
      {...props}
    />
  );
};
