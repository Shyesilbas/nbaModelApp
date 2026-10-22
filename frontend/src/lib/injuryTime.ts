const PUBLISHED = /(\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}) (AM|PM)/;

/**
 * Istanbul clock time for an injury report stamp such as "10/22/26 03:45 PM", which the league
 * publishes in Eastern time (daylight saving handled).
 */
export function reportLocalClock(published: string): string | null {
  const m = published.match(PUBLISHED);
  if (!m) return null;
  const [, mo, d, y, h, mi, ap] = m;
  const hour = (Number(h) % 12) + (ap === "PM" ? 12 : 0);
  const asUtc = Date.UTC(2000 + Number(y), Number(mo) - 1, Number(d), hour, Number(mi));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const newYorkAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const real = new Date(asUtc - (newYorkAsUtc - asUtc));
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(real);
}

/** "22:45 TSİ (03:45 PM ET)" for an injury report stamp; the stamp itself when it cannot be read. */
export function reportStampText(published: string): string {
  const tsi = reportLocalClock(published);
  const eastern = published.split(" ").slice(1).join(" ");
  return tsi ? `${tsi} TSİ (${eastern} ET)` : published;
}
