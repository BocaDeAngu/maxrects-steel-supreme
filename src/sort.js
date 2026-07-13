/**
 * Sort pieces by area descending — the most effective heuristic for
 * MaxRects bin packing. Largest pieces first ensures they get placed
 * while space is abundant; small pieces fill the remaining gaps.
 */

function sortByAreaDesc(pieces) {
  return [...pieces].sort((a, b) => (b.w * b.h) - (a.w * a.h));
}

/**
 * Sort pieces by height ascending — shelf-friendly for `direcao: horizontal`.
 * Short pieces first creates compact rows that consume the full width.
 */
function sortByHeightAsc(pieces) {
  return [...pieces].sort((a, b) => a.h - b.h || (b.w * b.h) - (a.w * a.h));
}

/**
 * Sort pieces by width ascending — column-friendly for `direcao: vertical`.
 * Narrow pieces first creates compact columns that consume the full height.
 */
function sortByWidthAsc(pieces) {
  return [...pieces].sort((a, b) => a.w - b.w || (b.w * b.h) - (a.w * a.h));
}

module.exports = { sortByAreaDesc, sortByWidthAsc, sortByHeightAsc };
