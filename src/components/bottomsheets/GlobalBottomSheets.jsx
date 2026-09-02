import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
import MentorshipRequestBottomSheet from '../../appMentor/MentorshipRequestBottomSheet';
import {useAppState} from '../../contexts/AppStateContext';
import AddNotebookBottomSheet from './AddNotebookBottomSheet';
import NoteInfoBottomMenu from './NoteInfoBottomMenu';
import ContinueWatchingSheet from '../../history/ContinueWatchingSheet';

export function GlobalBottomSheets() {
  const {
    bottomSheetRef,
    addNBbottomSheetRef,
    mentorMenteeRequestBottomSheetRef,
    continueWatchingSheetRef,
  } = useAppState();

  return (
    <>
      <BottomSheetModalProvider>
        <NoteInfoBottomMenu ref={bottomSheetRef} />
        <AddNotebookBottomSheet ref={addNBbottomSheetRef} />
        <MentorshipRequestBottomSheet ref={mentorMenteeRequestBottomSheetRef} />
        <ContinueWatchingSheet ref={continueWatchingSheetRef} />
      </BottomSheetModalProvider>
    </>
  );
}
