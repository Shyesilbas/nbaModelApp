export function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded px-4 py-2 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-white"
          : "border border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
