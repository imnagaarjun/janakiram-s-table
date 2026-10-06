export const DEFAULT_UNITS = [
  "kg",
  "gram",
  "litre",
  "ml",
  "piece",
  "Nos",
  "packet",
  "dozen",
  "bundle",
  "Padi",
  "Sippam",
  "Tin",
];

// Defaults first, then any custom units already used on products (case-insensitive, sorted).
export function mergeUnits(used: (string | null | undefined)[]): string[] {
  const seen = new Set(DEFAULT_UNITS.map((u) => u.toLowerCase()));
  const custom: string[] = [];
  for (const raw of used) {
    const u = raw?.trim();
    if (!u || seen.has(u.toLowerCase())) continue;
    seen.add(u.toLowerCase());
    custom.push(u);
  }
  custom.sort((a, b) => a.localeCompare(b));
  return [...DEFAULT_UNITS, ...custom];
}
