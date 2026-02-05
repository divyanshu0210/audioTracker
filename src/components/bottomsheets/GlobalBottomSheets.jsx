import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
import MentorshipRequestBottomSheet from '../../appMentor/MentorshipRequestBottomSheet';
import {useAppState} from '../../contexts/AppStateContext';
import AddNotebookBottomSheet from './AddNotebookBottomSheet';
import NoteInfoBottomMenu from './NoteInfoBottomMenu';

export function GlobalBottomSheets() {
  const {
    bottomSheetRef,
    addNBbottomSheetRef,
    mentorMenteeRequestBottomSheetRef,
  } = useAppState();

  return (
    <>
      <BottomSheetModalProvider>
        <NoteInfoBottomMenu ref={bottomSheetRef} />
        <AddNotebookBottomSheet ref={addNBbottomSheetRef} />
        <MentorshipRequestBottomSheet ref={mentorMenteeRequestBottomSheetRef} />
      </BottomSheetModalProvider>
    </>
  );
}
