import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import React, {useCallback, useState} from 'react';
import MenteeList from './MenteeList';
import {useAppState} from '../contexts/AppStateContext';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useFocusEffect} from '@react-navigation/core';
import useMentorMenteeStore from './useMentorMenteeStore';
import {addCategory, addItemToCategory} from '../categories/catDB';
import { BASE_URL } from '../appMentorBackend/userMgt';
import { useSelectionStore } from '../stores/useSelectionStore';
import { useShallow } from 'zustand/react/shallow';
import { navigationRef } from '../handlers/navigationRef';
import {ItemTypes} from '../contexts/constants';
import {getDriveCopyId} from '../database/sharedDriveCopies';
import UserAvatar from './UserAvatar';
import {getUserId} from './UserList';

const AssignScreen = () => {
const {selectedItems, setSelectedItems, setSelectionMode} =
  useSelectionStore(
    useShallow(state => ({
      selectedItems: state.selectedItems,
      setSelectedItems: state.setSelectedItems,
      setSelectionMode: state.setSelectionMode,
    })),
  );

const {userInfo} = useAppState();
  const {mentees, selectedUsers, setSelectedUsers, setUserSelectionMode} =
    useMentorMenteeStore();

  useFocusEffect(
    useCallback(() => {
      return () => {
        setSelectedUsers([]);
      };
    }, []),
  );

  // Only true while the request is in flight. The screen used to call
  // goBack() *before* the fetch, so the mentor was returned to their list
  // immediately and found out whether it worked from an alert that arrived
  // seconds later over whatever screen they had moved on to. Staying put and
  // showing this is what makes success or failure mean something.
  const [assigning, setAssigning] = useState(false);

  const addItemstomenteeCategory = async () => {
    for (const mentee of selectedUsers) {
      const menteeKey = `[MENTEE_CAT_Filter] ${mentee.user.full_name} (${mentee.user.email}) [MENTEE_CAT_Filter]`;

      try {
        // Create category for this mentee
        const defaultColor = '#007AFF';
        const categoryId = await addCategory(menteeKey, defaultColor);

        // Add each video to this mentee's category
        for (const video of selectedItems) {
          await addItemToCategory(categoryId, video.id, video.subtype || video.type);
        }
      } catch (catErr) {
        console.error(
          `Error creating category or adding items for ${menteeKey}`,
          catErr,
        );
      }
    }
  };

  // What the mentee's device can actually fetch for each selected item.
  //
  // Three of the four types are already addressable from anywhere: a YouTube
  // id, a Drive file id and an Iskcon path all mean the same thing on someone
  // else's phone. A device file does not — it is bytes on *this* phone, and
  // the only copy a mentee can reach is the one uploaded to Drive.
  const buildVideoPayload = async () => {
    const videos = [];
    const unshared = [];

    for (const item of selectedItems) {
      if (item.type === ItemTypes.DEVICE) {
        const driveFileId = item.dbId ? await getDriveCopyId(item.dbId) : null;
        if (!driveFileId) {
          unshared.push(item.title || 'Untitled');
          continue;
        }
        // Sent as 'device', not 'drive': the mentee should end up holding the
        // same file the mentor sees, in their Device tab under the same name,
        // rather than an unrelated-looking Drive entry named after whatever
        // the uploaded copy was called.
        //
        // The two ids say different things. video_id is where the bytes come
        // from — the Drive copy, the only thing another phone can reach.
        // origin_video_id is what the file *is*, and both sides key on it: it
        // becomes the mentee's source_id, and it keeps the mentor's own row
        // findable for the delivery tick.
        videos.push({
          video_id: driveFileId,
          video_type: ItemTypes.DEVICE,
          origin_video_id: item.id,
        });
        continue;
      }
      videos.push({video_id: item.id, video_type: item.type});
    }

    return {videos, unshared};
  };

  const shareWithMentees = async () => {
    if (
      !userInfo?.id ||
      selectedUsers.length === 0 ||
      selectedItems.length === 0
    ) {
      console.warn('Missing mentor ID, selected mentees, or videos.');
      return;
    }

    setAssigning(true);
    try {
      const {videos, unshared} = await buildVideoPayload();

      if (videos.length === 0) {
        Alert.alert(
          'Nothing to assign',
          `${unshared.length} device file(s) have no copy in your Drive. Share them first, then assign.`,
        );
        return;
      }

      const response = await fetch(
        `${BASE_URL}/assign/assign_videos_to_mentees/`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            mentor_id: userInfo.id,
            mentee_gmails: selectedUsers.map(u => u.user.email),
            videos,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Could not assign', data.error || 'Please try again.');
        return;
      }

      await addItemstomenteeCategory();

      const skipped =
        unshared.length > 0
          ? ` ${unshared.length} device file(s) were skipped — no copy in your Drive.`
          : '';
      ToastAndroid.show(
        `Assigned to ${selectedUsers.length} mentee(s).${skipped}`,
        ToastAndroid.LONG,
      );

      // Cleared only on success. A network failure used to wipe the selection
      // too, so a retry meant picking every file and every mentee again.
      setSelectionMode(false);
      setUserSelectionMode(false);
      setSelectedUsers([]);
      setSelectedItems([]);
      navigationRef.goBack();
    } catch (error) {
      console.error('Assign failed:', error);
      Alert.alert(
        'Network error',
        'The assignment could not be sent. Your selection has been kept.',
      );
    } finally {
      setAssigning(false);
    }
  };

  const itemCount = selectedItems.length;

  // Four is what fits beside the summary text without crowding the FAB on a
  // narrow screen; the rest become a count.
  const MAX_FACES = 4;
  const faces = selectedUsers.slice(0, MAX_FACES);
  const overflowCount = selectedUsers.length - faces.length;

  const allSelected =
    mentees.length > 0 && selectedUsers.length === mentees.length;

  // Entries are shaped exactly as UserList builds them — same id derivation,
  // same userType string — or the rows would not highlight as selected.
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedUsers([]);
      setUserSelectionMode(false);
      return;
    }
    setSelectedUsers(
      mentees.map(mentee => ({
        id: getUserId(mentee),
        userType: 'Mentees',
        user: mentee,
      })),
    );
    setUserSelectionMode(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>Assign to</Text>
          {mentees.length > 0 && (
            <TouchableOpacity onPress={toggleSelectAll} disabled={assigning}>
              <Text
                style={[
                  styles.selectAll,
                  assigning && styles.selectAllDisabled,
                ]}>
                {allSelected ? 'Clear' : 'Select all'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {/* What is being assigned, not just how many mentees are picked. The
            selection was made on a previous screen, so by the time someone is
            here there was nothing on screen confirming what they chose. */}
        <Text style={styles.headerSub}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
          {selectedUsers.length > 0
            ? ` · ${selectedUsers.length} selected`
            : ' · choose mentees below'}
        </Text>
      </View>

      <MenteeList />

      {selectedUsers.length > 0 && (
        <View style={styles.bottomBar}>
          {/* A facepile rather than a chip per mentee. Chips scrolled
              horizontally, so past two or three you could not tell how many
              you had picked without dragging through them — and the ones off
              screen were invisible at the moment you were deciding whether to
              send. This stays the same width whatever the count.
              Nothing is lost by dropping the names: the list above highlights
              every selected row, and the header carries the count. */}
          <View style={styles.facepile}>
            {faces.map((entry, index) => (
              <View
                key={entry.id}
                // Overlapped, each with a ring in the bar's own colour so the
                // edges stay legible against the avatar behind.
                style={[styles.face, index > 0 && styles.faceOverlap]}>
                <UserAvatar user={entry.user} size={28} />
              </View>
            ))}
            {overflowCount > 0 && (
              <View style={[styles.face, styles.faceOverlap, styles.overflow]}>
                <Text style={styles.overflowText}>+{overflowCount}</Text>
              </View>
            )}
          </View>

          <Text style={styles.selectionSummary} numberOfLines={1}>
            {selectedUsers.length === 1
              ? selectedUsers[0]?.user?.full_name ||
                selectedUsers[0]?.user?.email ||
                'Unnamed'
              : `${selectedUsers.length} mentees`}
          </Text>

          <TouchableOpacity
            style={[styles.fab, assigning && styles.fabDisabled]}
            onPress={shareWithMentees}
            disabled={assigning}>
            {assigning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-forward" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Blocking, because the work is not cancellable and every control here
          would either do nothing or make things worse mid-request — changing
          the mentee selection while it is being sent, most of all. */}
      {assigning && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.overlayText}>
              Assigning {itemCount} {itemCount === 1 ? 'item' : 'items'}…
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

export default AssignScreen;

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},

  header: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  selectAll: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
  },
  selectAllDisabled: {
    color: '#9ca3af',
  },
  headerSub: {
    marginTop: 4,
    fontSize: 14,
    // #6b7280 on white is legible as a caption but this line carries the only
    // confirmation of what is about to be sent, so it is body text, not a hint.
    color: '#374151',
  },

  // In normal flow, not absolute. Floating it over the list meant the last
  // mentee or two sat underneath the bar the moment it appeared and could not
  // be tapped — and the list only reserved 20px of bottom padding against a
  // bar three times that tall.
  bottomBar: {
    backgroundColor: '#f3f4f6',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  facepile: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  face: {
    borderWidth: 2,
    borderColor: '#f3f4f6',
    borderRadius: 16,
  },
  faceOverlap: {
    marginLeft: -10,
  },
  overflow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  selectionSummary: {
    flex: 1,
    marginLeft: 10,
    marginRight: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  fab: {
    backgroundColor: '#007AFF',
    borderRadius: 28,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 4,
  },
  fabDisabled: {
    backgroundColor: '#9ec5fe',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 22,
    alignItems: 'center',
    elevation: 6,
  },
  overlayText: {
    marginTop: 12,
    fontSize: 14,
    color: '#374151',
  },
});
