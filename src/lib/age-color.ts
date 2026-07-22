export type AgeLevel = "unknown" | "green" | "yellow" | "orange" | "red";

export type AgeThresholds = {
  green: number;
  yellow: number;
  orange: number;
};

export function daysSince(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function ageLevel(
  date: Date | string | null | undefined,
  thresholds: AgeThresholds,
): AgeLevel {
  const days = daysSince(date);
  if (days === null) return "unknown";
  if (days <= thresholds.green) return "green";
  if (days <= thresholds.yellow) return "yellow";
  if (days <= thresholds.orange) return "orange";
  return "red";
}

export function ageLabel(days: number | null): string {
  if (days === null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
