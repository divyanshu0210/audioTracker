// useFocusModeStore.js
//
// Which items arrived as assignments, held in memory so the player can ask on
// mount without waiting on the database.
//
// This is only a cache. The record is the mentor categories the assignment sync
// files items under, which getAssignedSourceIds derives from - nothing here is
// persisted, and losing it costs one query on the next launch.

import {create} from 'zustand';
import {getAssignedSourceIds} from '../categories/catDB';
import {isCompletedOnce} from './focusMode';
import useSettingsStore from '../Settings/settingsStore';

const useFocusModeStore = create((set, get) => ({
  // Source ids, as strings. A Set rather than an array because this is only
  // ever asked a membership question, once per player mount.
  assignedIds: new Set(),
  hydrated: false,

  /**
   * Fill from the assigned category.
   *
   * Runs after the assignment sync rather than beside it, so items that landed
   * this launch are already in the category by the time it reads.
   *
   * A failed read leaves whatever is already held. getAssignedSourceIds returns
   * null rather than [] on error for exactly this: an empty set would unlock
   * every assignment on the device, which is the one outcome a transient
   * database error must not be allowed to cause.
   */
  hydrate: async () => {
    const ids = await getAssignedSourceIds();
    if (ids === null) {
      // Still counts as hydrated — the player must not sit waiting on a read
      // that has already failed once.
      set({hydrated: true});
      return;
    }
    set({assignedIds: new Set(ids.map(String)), hydrated: true});
  },

  isAssigned: sourceId =>
    sourceId != null && get().assignedIds.has(String(sourceId)),

  // Signing out. The next person on this device is not the one these were
  // assigned to.
  clear: () => set({assignedIds: new Set(), hydrated: false}),
}));

/**
 * Whether focus mode is on for this item, and whether it can be turned off.
 *
 *   { on, locked }
 *
 * `locked` is the whole point of the feature: an assignment holds focus mode on
 * until it has been watched through once, and the toggle is dead while it does.
 * Anything else follows the person's own setting and can be switched either
 * way, per item, for as long as the player is open.
 *
 * An undecidable completion locks. isCompletedOnce returns null when there is
 * no duration to measure against yet — which is every item at mount, before the
 * player has reported one — and reading that as "finished" would unlock every
 * assignment for the first second of playback, which is exactly long enough to
 * turn the toggle off. Callers re-resolve once a real duration arrives.
 */
export const resolveFocusMode = async (sourceId, duration) => {
  const preference =
    useSettingsStore.getState().settings?.focusModeEnabled ?? false;

  if (!useFocusModeStore.getState().isAssigned(sourceId)) {
    return {on: preference, locked: false};
  }

  const completed = await isCompletedOnce(sourceId, duration);
  const locked = completed !== true;

  return {on: locked || preference, locked};
};

export default useFocusModeStore;
