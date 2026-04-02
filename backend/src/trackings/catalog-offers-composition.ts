/**
 * Classifies catalog rows for offer mix (laptop/PC vs hardware) using
 * `merchant_product_category_path` (stored as `categoryPath`) plus title fallbacks.
 *
 * German retail taxonomy (Alternate / Expert / similar Awin feeds) often uses:
 * - Laptops: `PC-System & Mobiles Gerät > Mobiles Gerät > Notebook`
 * - Desktops: `PC-System & Mobiles Gerät > PC-System`
 */

export type OffersCompositionTextFields = {
  title: string;
  category: string | null;
  categoryPath: string | null;
  productModel: string | null;
  description: string | null;
};

/** Leaf segments that are components, not complete PC/laptop systems. */
const HARDWARE_ONLY_LEAF = new Set<string>([
  'grafikkarte',
  'grafikkarten',
  'videokarte',
  'videokarten',
  'arbeitsspeicher',
  'ram',
  'ssd',
  'festplatte',
  'festplatten',
  'hdd',
  'nvme',
  'netzteil',
  'netzteile',
  'gehäuse',
  'gehäuselüfter',
  'mainboard',
  'mainboards',
  'motherboard',
  'motherboards',
  'prozessor',
  'prozessoren',
  'cpu',
  'kühler',
  'kühler & lüfter',
  'lüfter',
  'soundkarte',
  'soundkarten',
  'laufwerke',
  'einbaugeräte',
  'wasserkühlung',
]);

function splitCategoryPath(raw: string): string[] {
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/\s*\|\s*/g, ' > ')
    .replace(/\s*›\s*/g, ' > ')
    .replace(/\s*→\s*/g, ' > ');
  if (!t) return [];
  if (t.includes('>')) {
    return t
      .split('>')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter((s) => s.length > 0);
  }
  if (t.includes(' / ')) {
    return t
      .split(' / ')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter((s) => s.length > 0);
  }
  return [t];
}

function normalizeSegments(categoryPath: string | null, category: string | null): string[] {
  const primary = categoryPath?.trim();
  if (primary) return splitCategoryPath(primary);
  const fallback = category?.trim();
  return fallback ? splitCategoryPath(fallback) : [];
}

function lastSegment(segments: string[]): string {
  return segments.length > 0 ? segments[segments.length - 1] : '';
}

function segmentIsPcSystemNode(s: string): boolean {
  return s === 'pc-system' || s === 'pc system';
}

/**
 * Mounts, brackets, conversion kits — must not count as laptop/PC for offer mix.
 */
export function isOffersAccessoryRow(row: OffersCompositionTextFields): boolean {
  const hay = haystackFromRow(row);
  if (!hay) return false;

  if (
    /\b(halterung|halterungen|monitorhalter|monitor-halter|monitor arm|monitorarm|monitorständer|monitor ständer)\b/.test(
      hay,
    )
  ) {
    return true;
  }
  if (/\b(befestigung|tischhalter|wandhalter|tischhalterung|wandhalterung)\b/.test(hay)) {
    return true;
  }
  if (/\b(laptop-arm|notebook-arm|laptop arm|notebook arm|dual display)\b/.test(hay)) {
    return true;
  }
  if (/\bumbausatz\b/.test(hay) || /\bworkfit\b/.test(hay)) {
    return true;
  }
  if (/\bergotron\b/.test(hay) && /\b(halter|mount|arm)\b/.test(hay)) {
    return true;
  }
  if (/\b(desk mount|wall mount|vesa mount|monitor mount|screen mount)\b/.test(hay)) {
    return true;
  }
  if (/\bhalterung\s*\/\s*befestigung\b/.test(hay) || /\bbefestigung\s*\/\s*halterung\b/.test(hay)) {
    return true;
  }
  // Category path / name: Zubehör for monitors (not the device)
  if (/\bmonitorzubehör\b/.test(hay) || /\bpc-zubehör\b/.test(hay)) {
    return true;
  }
  if (/\bzubehör\b/.test(hay) && /\b(monitor|halter|ständer|mount)\b/.test(hay)) {
    return true;
  }

  return false;
}

/** Path or leaf suggests mounts/cables/adapters — not a complete PC. */
function joinedOrLastIndicatesAccessory(joined: string, last: string): boolean {
  const j = joined;
  const l = last;
  if (l.includes('halterung') || l.includes('befestigung')) return true;
  if (/\b(halterung|halterungen|monitorhalter|monitorhalterungen|monitor-arm|tischhalter|wandhalter)\b/.test(j)) {
    return true;
  }
  if (/\b(zubehör|zubehoer)\b/.test(l) && !/\b(notebook|laptop|pc-system)\b/.test(l)) return true;
  if (/\bkabel\b/.test(l) || /\badapter\b/.test(l)) return true;
  if (/\b(ersatzteil|ersatzteile|reparatur)\b/.test(j)) return true;
  return false;
}

function haystackFromRow(row: OffersCompositionTextFields): string {
  return [row.title, row.category, row.categoryPath, row.productModel, row.description]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' ')
    .toLowerCase();
}

/** Known complete-system leaves under a PC-System branch (not arbitrary peripherals). */
function isKnownPcSystemProductLeaf(last: string): boolean {
  if (segmentIsPcSystemNode(last)) return true;
  if (
    /^(komplett-pc|komplett pc|komplett-pcs|komplett pcs|gaming-pc|gaming pc|business-pc|business pc|office-pc|office pc|home-pc|home pc|mini-pc|mini pc|tower-pc|tower pc|desktop|desktops|workstation|workstations|barebone|barebones|nuc)$/.test(
      last,
    )
  ) {
    return true;
  }
  if (/^(desktops?|desktop pc|tower pc|all-in-one pcs?|apple mac pro|mac pro|mac studio)$/.test(last)) {
    return true;
  }
  return false;
}

/** Notebook / laptop style systems from merchant path. */
function pathIndicatesLaptop(segments: string[], joined: string): boolean {
  if (segments.length === 0) return false;
  const last = lastSegment(segments);

  if (HARDWARE_ONLY_LEAF.has(last)) return false;
  if (joinedOrLastIndicatesAccessory(joined, last)) return false;

  if (
    /^(notebook|notebooks|netbook|netbooks|laptop|laptops|chromebook|chromebooks|macbook|macbooks)$/.test(
      last,
    )
  ) {
    return true;
  }
  if (
    /^(convertible|2-in-1|2 in 1|ultrabook|ultrabooks|subnotebook|subnotebooks)([\s/-]|$)/.test(last)
  ) {
    return true;
  }

  // "PC-System & Mobiles Gerät > Mobiles Gerät > Notebook"
  if (
    joined.includes('mobiles gerät') &&
    /\b(notebook|laptop|chromebook|macbook|netbook|convertible|ultrabook)\b/.test(joined)
  ) {
    return true;
  }

  // English-style paths
  if (
    /\b(mobiles? device|mobile device|portable computer)\b/.test(joined) &&
    /\b(notebook|laptop|chromebook)\b/.test(joined)
  ) {
    return true;
  }
  return false;
}

/** Desktop / Komplett-PC style systems (leaf `PC-System` under the shared root). */
function pathIndicatesDesktopPc(segments: string[], joined: string): boolean {
  if (segments.length === 0) return false;
  const last = lastSegment(segments);

  if (HARDWARE_ONLY_LEAF.has(last)) return false;
  if (joinedOrLastIndicatesAccessory(joined, last)) return false;

  // "… > PC-System" (exact leaf — not the combined root "PC-System & Mobiles Gerät")
  if (segmentIsPcSystemNode(last)) {
    return true;
  }

  if (isKnownPcSystemProductLeaf(last) && !segmentIsPcSystemNode(last)) {
    return true;
  }

  const hasDedicatedPcSystemSegment = segments.some(
    (s, i) => i > 0 && segmentIsPcSystemNode(s),
  );
  if (hasDedicatedPcSystemSegment && !pathIndicatesLaptop(segments, joined)) {
    // Only count as desktop if the leaf is a known system type (not e.g. Monitorhalterungen).
    if (isKnownPcSystemProductLeaf(last)) {
      return true;
    }
  }

  return false;
}

function pathIndicatesHardwareOnlyLeaf(segments: string[]): boolean {
  const last = lastSegment(segments);
  return HARDWARE_ONLY_LEAF.has(last);
}

export function classifyOffersComposition(row: OffersCompositionTextFields): {
  laptopOrPc: boolean;
  hardwareGpu: boolean;
} {
  if (isOffersAccessoryRow(row)) {
    return { laptopOrPc: false, hardwareGpu: false };
  }

  const segments = normalizeSegments(row.categoryPath, row.category);
  const joined = segments.join(' > ');

  const fromPathLaptop = pathIndicatesLaptop(segments, joined);
  const fromPathDesktop = pathIndicatesDesktopPc(segments, joined);
  let laptopOrPc = fromPathLaptop || fromPathDesktop;

  const hay = haystackFromRow(row);

  if (!laptopOrPc) {
    laptopOrPc =
      /\b(laptop|notebook|chromebook|macbook)\b/.test(hay) ||
      /\b(imac|desktop|workstation)\b/.test(hay) ||
      /\b(all-in-one|all in one)\b/.test(hay) ||
      /\b(mini-pc|mini pc|minipc)\b/.test(hay) ||
      /\bnuc\b/.test(hay) ||
      /\bgaming(\s|-)?pc\b/.test(hay) ||
      /\b(tower|office|business)(\s|-)?pc\b/.test(hay) ||
      /\bgaming(\s|-)?computer\b/.test(hay);
  }

  // Pure component category: do not count as laptop/PC system even if title is vague
  if (pathIndicatesHardwareOnlyLeaf(segments) && !fromPathLaptop && !fromPathDesktop) {
    laptopOrPc = false;
  }

  const looksLikeSystem =
    /\b(laptop|notebook|chromebook|macbook|tablet|smartphone|handy|iphone|ipad)\b/.test(hay);
  const strongComponent =
    /\b(grafikkarte|grafikkarten|graphics card|graphics-card|video card|video-card)\b/.test(hay);
  const hardwareGpu =
    (!looksLikeSystem || strongComponent) &&
    (strongComponent ||
      /\b(geforce|quadro|nvidia rtx|\brtx\b|radeon rx|\brx\s*7[0-9]{3}\b|\brx\s*6[0-9]{3}\b)\b/.test(
        hay,
      ) ||
      /\bintel arc\b/.test(hay) ||
      /\b(mainboard|motherboard|main board)\b/.test(hay) ||
      /\b(arbeitsspeicher|ddr[45](\s|-)?ram|ram(\s|-)?kit)\b/.test(hay) ||
      /\b(m\.2|nvme)\b/.test(hay) ||
      /\b(ssd|festplatte|hdd)\b/.test(hay) ||
      /\b(netzteil|power\s*supply|psu)\b/.test(hay) ||
      /\b(pc-?gehäuse|gehäuse|pc case|computer case)\b/.test(hay));

  return { laptopOrPc, hardwareGpu };
}
