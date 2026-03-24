/** Extract first plausible price from mixed text (€12,34 / 12.99 / 1 234,56) */
export function parsePriceFromText(raw: string): number | null {
  const s = raw.replace(/\u00a0/g, ' ').trim();
  if (!s) return null;

  const normalized = s.replace(/[^\d.,-]/g, (c) => (c === '-' ? '-' : ''));
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  let candidate = normalized;

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      candidate = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      candidate = normalized.replace(/,/g, '');
    }
  } else if (lastComma > -1 && lastDot === -1) {
    const parts = normalized.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      candidate = `${parts[0].replace(/\./g, '')}.${parts[1]}`;
    } else {
      candidate = normalized.replace(/,/g, '');
    }
  } else if (lastDot > -1 && lastComma === -1) {
    const parts = normalized.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      candidate = normalized;
    } else if (parts.length > 2) {
      candidate = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
    }
  }

  const n = Number.parseFloat(candidate);
  return Number.isFinite(n) ? n : null;
}
