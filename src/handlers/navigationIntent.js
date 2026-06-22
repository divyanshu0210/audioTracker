// navigationIntent.js
//
// A one-shot "where to land after the app finishes booting" intent. Used for
// deep links that arrive during a cold start (e.g. the downloads notification):
// the login → MainApp redirect reads this so it can land with the target
// screen already on the stack, instead of pushing it afterwards (which would
// flash MainApp first, then jump).

let pendingRoute = null;

export const setPendingRoute = route => {
  pendingRoute = route;
};

export const consumePendingRoute = () => {
  const route = pendingRoute;
  pendingRoute = null;
  return route;
};
