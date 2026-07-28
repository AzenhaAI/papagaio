// The PapaGaio mark, in one place: the site favicon and the app launcher icon
// are rendered from these two functions, so they can never drift apart.
//
// The background is the flag in its own 2:3 green/red split. The bird sits on
// the seam, which is why it carries a dark outline — without it the body
// disappears into the green half and only half a parrot reads at 40px.

export const GREEN = '#1f7a4d';
export const RED = '#c8102e';
export const LIME = '#34d17b';
export const AMBER = '#ffc857';
export const INK = '#0e1a14';

/// The flag split, full bleed. `s` is the side of the square.
export const flagBack = (s) => {
  const cut = (s * 2) / 5; // 2:3, the real proportion
  return (
    `<rect width="${cut}" height="${s}" fill="${GREEN}"/>` +
    `<rect x="${cut}" width="${s - cut}" height="${s}" fill="${RED}"/>`
  );
};

/// The bird alone, centred on the square and scaled to `k` of its side.
/// Drawn in a 64-unit space, then placed — the geometry below is the same one
/// the favicon has always used.
export const parrot = (s, k = 0.62) => {
  // Bird bounds in the 64-unit space: x 17…52, y 14…56.
  const box = 42; // the taller side, so k means "share of the icon"
  const scale = (s * k) / box;
  const cx = 34.5;
  const cy = 35;
  return (
    `<g transform="translate(${s / 2} ${s / 2}) scale(${scale}) translate(${-cx} ${-cy})" ` +
    `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round">` +
    `<path d="M23 38c-2 8 1 14 7 18 7-4 10-10 8-18-5 3-10 3-15 0z" fill="${GREEN}"/>` +
    `<circle cx="30" cy="27" r="13" fill="${LIME}"/>` +
    `<path d="M43 25c6 1 9 4 9 8-5-1-8-2-10-4z" fill="${AMBER}"/>` +
    `<circle cx="35" cy="23" r="3" fill="${INK}" stroke="none"/>` +
    `</g>`
  );
};

export const svg = (s, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" ` +
  `viewBox="0 0 ${s} ${s}">${body}</svg>`;
