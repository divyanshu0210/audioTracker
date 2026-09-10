// useInMenteeCategory.js
//
// True while a mentor is looking at one of their mentees' categories.
//
// That view is filed from the mentor's *own* library — addItemstomenteeCategory
// links their existing rows into the mentee's category — so Delete there does
// not withdraw the assignment, it soft-deletes the file from every tab and
// every other mentee's category, while the AssignedVideo row and the mentee's
// copy both survive. It reads as "take this back" and does the opposite, which
// is why the entry is hidden rather than left to a confirmation dialog.
//
// Scoped to the mentee side on purpose. A mentee inside a mentor's category is
// looking at their own library and may delete from it; only the direction where
// the label misleads is removed.
//
// The category is matched by id rather than by name: a mentee category carries
// the [MENTEE_CAT_Filter] tag, but a mentor category is just "Name (email)",
// which a user could type themselves. Comparing against the id the drawer
// recorded also means CategorySelectionModal changing the selection simply
// stops matching, with no stale flag to clear.

import useMentorMenteeStore from './useMentorMenteeStore';
import {useSelectionStore} from '../stores/useSelectionStore';

export const useInMenteeCategory = () => {
  const activeMentee = useMentorMenteeStore(state => state.activeMentee);
  const activeCategoryId = useMentorMenteeStore(
    state => state.activeCategoryId,
  );
  const selectedCategory = useSelectionStore(state => state.selectedCategory);

  return (
    !!activeMentee &&
    activeCategoryId != null &&
    selectedCategory === activeCategoryId
  );
};

export default useInMenteeCategory;
