/**
 * Instant Gaming embeds the current price in a global script assignment, not in
 * Product JSON-LD (only BreadcrumbList is in ld+json). See `window.productModel`.
 */
const PRODUCT_MODEL_MARKER = 'window.productModel = ';

export function extractInstantGamingPriceFromHtml(html: string): string | null {
  const idx = html.indexOf(PRODUCT_MODEL_MARKER);
  if (idx === -1) return null;
  const head = html.slice(idx + PRODUCT_MODEL_MARKER.length, idx + PRODUCT_MODEL_MARKER.length + 20000);
  // Main game price is a JSON number: "price":25.96 — DLC lines use "price":"11.19" (string), so require numeric form.
  const m = head.match(/"price"\s*:\s*(\d+(?:\.\d+)?)(?=\s*[,}])/);
  return m ? m[1] : null;
}
