// utils/track.js

import React, {useRef} from 'react';

const styles = [
  '🔴',
  '🟢',
  '🟡',
  '🔵',
  '🟣',
  '🟠',
  '🟤',
  '⚫',
  '⚪',
  '🟥',
  '🟩',
  '🟦',
  '🟪',
  '🟧',
  '🔷',
  '💠',
  '⭐',
  '🔥',
  '⚡',
];

function getStableStyle(name) {
  let hash = 0;

  for (let i = 0; i < name.length; i++) {
    hash =
      name.charCodeAt(i) +
      ((hash << 5) - hash);
  }

  return styles[Math.abs(hash) % styles.length];
}

export function track(Component) {
  const componentName =
    Component.displayName ||
    Component.name ||
    'Anonymous';

  const style = getStableStyle(componentName);

  function TrackedComponent(props) {
    const renderCount = useRef(0);
    const lastRenderTime = useRef(Date.now());

    renderCount.current++;

    if (__DEV__) {
      const now = Date.now();

      const diff =
        now - lastRenderTime.current;

      lastRenderTime.current = now;

      console.log(
        `---------------------------------------${style} [${componentName}] #${renderCount.current} (+${diff}ms)--------------------------------------`,
      );
    }

    return <Component {...props} />;
  }

  TrackedComponent.displayName =
    `Tracked(${componentName})`;

  return React.memo(TrackedComponent);
}