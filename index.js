/**
 * maxrects-steel-supreme — MaxRects bin packing with BRS + look-ahead.
 *
 * Usage:
 *   const { nest } = require('maxrects-steel-supreme');
 *   const result = nest(pieces, 2000, 1000, { margin: 10, lookAhead: 1 });
 */

const { nest } = require('./src/maxrects');
module.exports = { nest };
