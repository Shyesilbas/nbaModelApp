/** Formats a feet-inches height such as "6-8" as "6'8"; anything else is returned unchanged. */
export function formatHeight(height?: string | null): string {
  if (!height) return "";
  const match = height.trim().match(/^(\d+)\s*[-']\s*(\d+)"?$/);
  return match ? `${match[1]}'${match[2]}` : height;
}
