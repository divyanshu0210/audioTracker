// renderLog.js
//
// The per-render "🎯 Render X #n" tracing, behind a switch.
//
// These are genuinely useful when chasing a re-render, and genuinely costly to
// leave on: console.log in React Native serialises its arguments across the
// bridge, so in a scrolling list the logging outweighs the rendering it is
// measuring. VirtualizedList's "large list that is slow to update" warning was
// partly this.
//
// Flip RENDER_TRACING to true to get them back. Guarded by __DEV__ as well, so
// a release build can never pay for it even if that is left on.

const RENDER_TRACING = false;

export const renderTracingOn = __DEV__ && RENDER_TRACING;

/**
 * Usage:
 *   const renders = useRef(0);
 *   renders.current++;
 *   logRender('BASE ITEM', renders.current, item?.type);
 *
 * The counter still increments when tracing is off - it costs nothing and
 * keeps the call sites identical either way.
 */
export const logRender = (label, count, ...details) => {
  if (!renderTracingOn) return;
  console.log(`🎯 Render ${label} #${count}`, ...details);
};
