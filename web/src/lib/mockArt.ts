/**
 * Deterministic abstract artwork as SVG data URIs, so the mock feed looks like a real feed with
 * zero network requests and no bundled binaries.
 */

const PALETTES: readonly (readonly string[])[] = [
  ["#1A1A2E", "#2747D6", "#9DB2F5", "#FAFAFB"],
  ["#F2A900", "#1A1A2E", "#FFE2A8", "#FFF8EA"],
  ["#2E2A4F", "#E8637A", "#F7C8B0", "#FDF3EC"],
  ["#123C3A", "#4FA897", "#D9EDE4", "#FBFDF9"],
  ["#3A1F3D", "#C06C84", "#F3D1C4", "#FDF6F2"],
  ["#1F2933", "#7B8794", "#CBD2D9", "#F5F7FA"],
];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Style = "bands" | "orbit" | "grid" | "arcs";

/** One square abstract piece, stable for a given seed. */
export function mockArt(seed: number, style: Style = (["bands", "orbit", "grid", "arcs"] as const)[seed % 4]!): string {
  const rand = rng(seed * 2654435761);
  const palette = PALETTES[seed % PALETTES.length]!;
  const [ink = "#1A1A2E", accent = "#2747D6", soft = "#CBD2D9", paper = "#FAFAFB"] = palette;
  const pick = (): string => [ink, accent, soft][Math.floor(rand() * 3)] ?? ink;
  const parts: string[] = [`<rect width="600" height="600" fill="${paper}"/>`];

  if (style === "bands") {
    let y = 0;
    while (y < 600) {
      const h = 24 + rand() * 90;
      parts.push(`<rect x="0" y="${y.toFixed(0)}" width="600" height="${h.toFixed(0)}" fill="${pick()}" opacity="${(0.4 + rand() * 0.6).toFixed(2)}"/>`);
      y += h;
    }
    parts.push(`<rect x="${(60 + rand() * 300).toFixed(0)}" y="0" width="${(40 + rand() * 90).toFixed(0)}" height="600" fill="${paper}" opacity="0.85"/>`);
  } else if (style === "orbit") {
    parts.push(`<rect width="600" height="600" fill="${ink}"/>`);
    for (let i = 0; i < 7; i += 1) {
      parts.push(
        `<circle cx="${(100 + rand() * 400).toFixed(0)}" cy="${(100 + rand() * 400).toFixed(0)}" r="${(30 + rand() * 170).toFixed(0)}" fill="none" stroke="${pick()}" stroke-width="${(2 + rand() * 14).toFixed(1)}" opacity="${(0.5 + rand() * 0.5).toFixed(2)}"/>`,
      );
    }
    parts.push(`<circle cx="${(200 + rand() * 200).toFixed(0)}" cy="${(200 + rand() * 200).toFixed(0)}" r="${(20 + rand() * 60).toFixed(0)}" fill="${accent}"/>`);
  } else if (style === "grid") {
    const cells = 4 + Math.floor(rand() * 4);
    const size = 600 / cells;
    for (let x = 0; x < cells; x += 1) {
      for (let y = 0; y < cells; y += 1) {
        if (rand() < 0.3) continue;
        const inset = rand() * size * 0.3;
        parts.push(
          `<rect x="${(x * size + inset).toFixed(1)}" y="${(y * size + inset).toFixed(1)}" width="${(size - inset * 2).toFixed(1)}" height="${(size - inset * 2).toFixed(1)}" rx="${(rand() * size * 0.5).toFixed(1)}" fill="${pick()}" opacity="${(0.35 + rand() * 0.65).toFixed(2)}"/>`,
        );
      }
    }
  } else {
    for (let i = 0; i < 9; i += 1) {
      const r = 60 + i * 28 + rand() * 20;
      parts.push(
        `<path d="M 0 600 A ${r.toFixed(0)} ${r.toFixed(0)} 0 0 1 ${Math.min(600, r).toFixed(0)} ${(600 - r).toFixed(0)}" fill="none" stroke="${pick()}" stroke-width="${(3 + rand() * 18).toFixed(1)}" opacity="${(0.4 + rand() * 0.6).toFixed(2)}"/>`,
      );
    }
    parts.push(`<rect x="0" y="${(420 + rand() * 120).toFixed(0)}" width="600" height="${(20 + rand() * 60).toFixed(0)}" fill="${accent}" opacity="0.9"/>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">${parts.join("")}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
