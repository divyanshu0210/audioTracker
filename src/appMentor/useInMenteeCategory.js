// useInMenteeCategory.js
//
// True while a mentor is looking at one of their mentees' categories.
//
// That view is filed from the mentor's *own* library — addItemstomenteeCategory
// links their existing rows into the mentee's category — so every entry in an
// item's menu acts on the mentor's shelf while reading as though it acted on
// the mentee's. Delete is the sharpest case: it does not withdraw the
// assignment, it soft-deletes the file from every tab and every other mentee's
// category, while the AssignedVideo row and the mentee's copy both survive. It
// reads as "take this back" and does the opposite. Download and Add to Category
// are the same mistake with a smaller bill.
//
// BaseMenu reads this to cut the menu down to what is actually about the
// mentee: their notes on the item, and a link to hand them.
//
// Scoped to the mentee side on purpose. A mentee inside a mentor's category is
// looking at their own library and may delete from it; only the direction where
// the label misleads is trimmed.
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
