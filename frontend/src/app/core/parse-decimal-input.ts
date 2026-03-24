/**
 * Parses price/threshold input that may use `,` as decimal separator (e.g. DE: "25,96")
 * or thousands separators. Plain `Number()` fails on comma decimals.
 */
export function parseDecimalInput(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (s === '') return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  let normalized: string;
  if (hasComma && !hasDot) {
    normalized = s.replace(',', '.');
  } else if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = s.replace(/,/g, '');
    }
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
