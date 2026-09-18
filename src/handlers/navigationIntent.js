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

/**
 * Sends a signed-in user in, to their deep link or to MainApp.
 *
 * Here rather than in GoogleLoginScreen because the permission gate stands
 * between the two now: login works out where the user is going, the gate
 * holds them until the app can do its job, and then the same landing happens
 * from a different screen. Two copies would be two chances to drift.
 *
 * The route has to be consumed before the gate replaces the login screen and
 * spent after the gate lets go, so it is passed in rather than read here —
 * consumePendingRoute is one-shot and reading it twice would lose it.
 */
export const landAfterLogin = (navigation, {pendingRoute, user}) => {
  if (pendingRoute) {
    navigation.reset({
      index: 0,
      routes: [{name: pendingRoute, params: {launchedDirectly: true}}],
    });
    return;
  }

  navigation.replace('MainApp', {user});
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
