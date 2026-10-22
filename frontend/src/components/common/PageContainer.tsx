import React from "react";

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
}

export const PageContainer: React.FC<PageContainerProps> = ({
  maxWidth = "2xl",
  className = "",
  children,
  ...props
}) => {
  const maxStyles = {
    sm: "max-w-3xl",
    md: "max-w-5xl",
    lg: "max-w-6xl",
    xl: "max-w-7xl",
    "2xl": "max-w-[1440px]",
    full: "max-w-full",
  }[maxWidth];

  return (
    <main
      className={`mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 ${maxStyles} ${className}`.trim()}
      {...props}
    >
      {children}
    </main>
  );
};
