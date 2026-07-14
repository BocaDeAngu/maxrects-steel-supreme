/**
 * maxrects-steel-supreme — MaxRects bin packing with BRS + look-ahead.
 *
 * Usage:
 *   const { nest } = require('maxrects-steel-supreme');
 *   const result = nest(pieces, 2000, 1000, { margin: 10, lookAhead: 1, estrategia: 2 });
 *
 * Strategies: 0=Vertical, 1=Horizontal, 2=Retângulo (BRS+waste), 3=Quadrado (square+waste)
 */

const { nest } = require('./src/maxrects');
module.exports = { nest };
