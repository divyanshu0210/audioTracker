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

// Whether this launch came in with something to open — a link or a share from
// another app. Not a route (those handlers navigate for themselves once they
// know what the link is); just the fact that the app was opened *at* something,
// which is the opposite of opening it to carry on where you left off.
//
// Not consumed like pendingRoute: it describes the launch, and anything asking
// later is asking about the same launch. A fresh process starts it false again.
let externalLaunch = false;

export const markExternalLaunch = () => {
  externalLaunch = true;
};

export const wasExternalLaunch = () => externalLaunch;
