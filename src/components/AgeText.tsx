import { ageLabel, ageLevel, daysSince, type AgeThresholds } from "@/lib/age-color";

export function AgeText({
  date,
  thresholds,
  prefix = "",
}: {
  date: Date | string | null | undefined;
  thresholds: AgeThresholds;
  prefix?: string;
}) {
  const level = ageLevel(date, thresholds);
  const days = daysSince(date);

  return (
    <span className="age" data-level={level}>
      {prefix}
      {days === null ? "Unknown" : ageLabel(days)}
    </span>
  );
}
