/**
 * Sort pieces by area descending — the most effective heuristic for
 * MaxRects bin packing. Largest pieces first ensures they get placed
 * while space is abundant; small pieces fill the remaining gaps.
 */

function sortByAreaDesc(pieces) {
  return [...pieces].sort((a, b) => (b.w * b.h) - (a.w * a.h));
}

module.exports = { sortByAreaDesc };
