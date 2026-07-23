/** Build a display label when users don't name filament rolls. */
export function filamentLabel(input: {
  manufacturer?: string | null;
  material?: string | null;
  color?: string | null;
}): string {
  const parts = [input.manufacturer, input.material, input.color]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.join(" · ") || "Filament";
}
