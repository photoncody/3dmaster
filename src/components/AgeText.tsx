import { ageLabel, ageLevel, type AgeThresholds } from "@/lib/age-color";

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
  const days =
    date == null
      ? null
      : Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24),
          ),
        );

  return (
    <span className="age" data-level={level}>
      {prefix}
      {ageLabel(days)}
    </span>
  );
}
