import {create} from 'zustand';

// Uploads in flight, as {itemId: percent}.
//
// Only the transient half lives here. Which files *have* a shared copy comes
// from the db with the item itself (getChildrenByParent joins
// shared_drive_copies), so there is no second copy of that to keep in sync —
// an earlier version held a map here and had to be re-hydrated after a restore
// wrote rows behind its back.
const useShareStore = create((set, get) => ({
  uploading: {},

  // value is a percentage, or null to clear. Tested for presence rather than
  // truth everywhere, so that 0% still counts as uploading.
  setUploading: (itemId, value) =>
    set(s => {
      if (value == null) {
        const {[itemId]: _, ...rest} = s.uploading;
        return {uploading: rest};
      }
      return {uploading: {...s.uploading, [itemId]: value}};
    }),

  isUploading: itemId => get().uploading[itemId] != null,
}));

export default useShareStore;
