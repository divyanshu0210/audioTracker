import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import MenteeList from './MenteeList';
import {useAppState} from '../contexts/AppStateContext';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useFocusEffect} from '@react-navigation/core';
import useMentorMenteeStore from './useMentorMenteeStore';
import {addCategory, addItemToCategory} from '../categories/catDB';
import {BASE_URL} from '../appMentorBackend/userMgt';
import {fetchMenteeAssignments} from '../appMentorBackend/assignmentsMgt';
import {useSelectionStore} from '../stores/useSelectionStore';
import {useShallow} from 'zustand/react/shallow';
import {navigationRef} from '../handlers/navigationRef';
import {grantReaderAccess} from '../share/driveUpload';
import UserAvatar from './UserAvatar';
import {getUserId} from './UserList';
import AssignManifest from './AssignManifest';
import {
  AssignStatus,
  buildAssignPlan,
  existingAssignmentFor,
  indexAssignments,
  readyEntries,
  summarisePlan,
} from './assignPlan';

// Run `task` over `items`, at most `limit` in flight, preserving order.
// Nothing here rejects — askAbout catches its own failures — so a single
// Promise.all over the results is enough.
const mapWithLimit = async (items, limit, task) => {
  const results = new Array(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };

  await Promise.all(
    Array.from({length: Math.min(limit, items.length)}, worker),
  );
  return results;
};

const AssignScreen = () => {
  const {selectedItems, setSelectedItems, setSelectionMode} = useSelectionStore(
    useShallow(state => ({
      selectedItems: state.selectedItems,
      setSelectedItems: state.setSelectedItems,
      setSelectionMode: state.setSelectionMode,
    })),
  );

  const {userInfo} = useAppState();
  const {mentees, selectedUsers, setSelectedUsers, setUserSelectionMode} =
    useMentorMenteeStore(
      useShallow(state => ({
        mentees: state.mentees,
        selectedUsers: state.selectedUsers,
        setSelectedUsers: state.setSelectedUsers,
        setUserSelectionMode: state.setUserSelectionMode,
      })),
    );

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

  // ── What is being sent ────────────────────────────────────────────────
  //
  // Worked out when the screen opens rather than when Assign is pressed. The
  // selection can hold notes, notebooks and device files with no Drive copy —
  // the Assign button appears as soon as one item in it is assignable — and
  // all of that used to be discovered inside the send: the unsendable parts
  // were dropped into a sentence at the end of a toast, and the unsupported
  // ones were posted anyway, as rows the mentee's app has no branch for.
  const [plan, setPlan] = useState([]);
  const [planLoading, setPlanLoading] = useState(true);

  // The plan is rebuilt whenever the selection changes, which now includes a
  // mentor removing one item from it. Only the first build shows the spinner:
  // flipping the whole card to "Checking what can be assigned…" because one
  // row was dropped reads as the screen restarting.
  const builtOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!builtOnce.current) setPlanLoading(true);
    buildAssignPlan(selectedItems)
      .then(entries => {
        if (!cancelled) {
          setPlan(entries);
          builtOnce.current = true;
        }
      })
      .catch(error => {
        console.warn('Could not inspect the selection:', error?.message ?? error);
        if (!cancelled) setPlan([]);
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedItems]);

  const summary = useMemo(() => summarisePlan(plan), [plan]);
  const sendable = useMemo(() => readyEntries(plan), [plan]);

  // ── What each mentee already has ──────────────────────────────────────
  //
  // Assigning the same lecture twice makes a second row on the mentee's side
  // with its own delivery state, so a mentor re-sending a list "to be safe"
  // was quietly duplicating everything in it. The server knows what it already
  // holds, so ask it.
  //
  // Asked for every mentee on the list, not only the ones already picked. The
  // question a mentor is standing here to answer is "who still needs this",
  // and answering it only after they have picked someone puts the answer after
  // the decision. Every row carries it instead, so the list itself is the
  // answer.
  //
  // Cached in a ref keyed by mentee id and never refetched while the screen is
  // open: tapping the same two mentees on and off is a normal thing to do, and
  // it should not cost a request each time. Anything assigned from elsewhere
  // in the seconds this screen is open would not be worth the requests.
  const assignmentsByMentee = useRef({});
  const [assignmentsVersion, setAssignmentsVersion] = useState(0);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  // A mentee whose assignments could not be read gets no badge, which looks
  // exactly like one that has not loaded yet. Said once, in the manifest,
  // rather than leaving the blank rows to be read as an answer.
  const [checkFailed, setCheckFailed] = useState(false);

  const menteeIdOf = entry => entry.user?.id ?? entry.id;

  useEffect(() => {
    // Nothing sendable means nothing to compare against, and this is one
    // request per mentee — a selection of notes alone should not cost a round
    // of them. Waiting on `sendable` also waits out the plan, which is built
    // asynchronously.
    if (!userInfo?.id || sendable.length === 0) return;

    const missing = mentees
      .map(mentee => mentee.id ?? getUserId(mentee))
      .filter(id => id != null && !(String(id) in assignmentsByMentee.current));

    if (missing.length === 0) return;

    // Claimed before the requests go out, so that a re-run of this effect —
    // the mentee list refreshing, say — does not ask about the same people
    // again. `undefined` still answers the `in` test above, and newVideosFor
    // reads it the same way it reads a failure: as "not known yet", which is
    // what it is.
    for (const menteeId of missing) {
      assignmentsByMentee.current[String(menteeId)] = undefined;
    }

    let cancelled = false;
    setCheckingDuplicates(true);

    const askAbout = async menteeId => {
      try {
        const assignments = await fetchMenteeAssignments(userInfo.id, menteeId);
        return [String(menteeId), indexAssignments(assignments)];
      } catch (error) {
        console.warn(
          `Could not read what mentee ${menteeId} already has:`,
          error?.message ?? error,
        );
        // Null, not an empty map, so the difference between "has nothing"
        // and "could not ask" survives: the first is a fact worth showing,
        // the second must not make the screen claim an item is new.
        return [String(menteeId), null];
      }
    };

    // A few at a time. This went from "the mentees you picked" to "everyone",
    // and a mentor with thirty of them firing thirty simultaneous requests at
    // a phone's connection is how the first badges arrive slower than the last.
    mapWithLimit(missing, 4, askAbout).then(results => {
      // Written even when this effect run has been superseded. The answer is
      // about a mentee, not about a particular selection, so it is still true
      // — dropping it would only mean asking for it again.
      for (const [id, map] of results) {
        assignmentsByMentee.current[id] = map;
      }
      setAssignmentsVersion(v => v + 1);
      if (!cancelled) {
        setCheckingDuplicates(false);
        if (results.some(([, map]) => map === null)) setCheckFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mentees, sendable, userInfo?.id]);

  // The new (item, mentee) pairs: what a press of Assign would actually
  // create. A mentee whose map could not be fetched is treated as having
  // nothing — a duplicate row is a smaller harm than an assignment silently
  // withheld because one request failed.
  const newVideosFor = useCallback(
    menteeEntry => {
      const map = assignmentsByMentee.current[String(menteeIdOf(menteeEntry))];
      if (!map) return sendable;
      return sendable.filter(entry => !existingAssignmentFor(map, entry));
    },
    // assignmentsVersion is the dependency that matters — the ref itself never
    // changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendable, assignmentsVersion],
  );

  // ── Dropping something from the selection ─────────────────────────────
  //
  // The selection is the app's one shared selection, so this deselects the row
  // on the screen it was made on too. That is the honest behaviour: the mentor
  // is saying "not this one", not "not this one, just for now" — and coming
  // back to find it still ticked would be the surprise.
  const removeFromSelection = useCallback(
    keys => {
      const dropping = new Set(keys);
      const kept = selectedItems.filter(
        item => !dropping.has(`${item.type}:${item.id}`),
      );
      setSelectedItems(kept);
      // Emptying the selection here should leave the app as if nothing had
      // ever been selected, or the screen behind this one keeps its selection
      // header over a list with nothing ticked in it.
      if (kept.length === 0) setSelectionMode(false);
    },
    [selectedItems, setSelectedItems, setSelectionMode],
  );

  const removeEntry = useCallback(
    entry => removeFromSelection([entry.key]),
    [removeFromSelection],
  );

  // The bulk version of the reason this screen exists. A mentor who picked a
  // notebook and four notes along with their lectures should not have to tap
  // five times to say what one glance already told them.
  const unsendableKeys = useMemo(
    () =>
      plan
        .filter(entry => entry.status !== AssignStatus.READY)
        .map(entry => entry.key),
    [plan],
  );

  const removeUnsendable = useCallback(
    () => removeFromSelection(unsendableKeys),
    [removeFromSelection, unsendableKeys],
  );

  // Per item: which of the selected mentees already have it. Drives the chip
  // on each manifest row, so "already assigned" is visible before the send
  // rather than being quietly deduplicated behind the mentor's back.
  //
  // The people themselves, not a tally. "Already with 2 of 3" made the mentor
  // work out which two by unpicking mentees one at a time; their faces answer
  // it where the question is asked.
  const duplicates = useMemo(() => {
    const result = {};
    if (selectedUsers.length === 0) return result;

    for (const entry of sendable) {
      const users = [];
      for (const menteeEntry of selectedUsers) {
        const map = assignmentsByMentee.current[String(menteeIdOf(menteeEntry))];
        if (map && existingAssignmentFor(map, entry)) users.push(menteeEntry.user);
      }
      if (users.length > 0) {
        result[entry.key] = {
          users,
          all: users.length === selectedUsers.length,
        };
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendable, selectedUsers, assignmentsVersion]);

  // Per mentee, for the badge on their row.
  const newCountFor = useCallback(
    mentee => {
      const map = assignmentsByMentee.current[String(mentee.id ?? getUserId(mentee))];
      if (!map) return null;
      return sendable.filter(entry => !existingAssignmentFor(map, entry)).length;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendable, assignmentsVersion],
  );

  const totalNewPairs = useMemo(
    () =>
      selectedUsers.reduce(
        (sum, menteeEntry) => sum + newVideosFor(menteeEntry).length,
        0,
      ),
    [selectedUsers, newVideosFor],
  );

  const menteesWithNothingNew = useMemo(
    () => selectedUsers.filter(m => newVideosFor(m).length === 0).length,
    [selectedUsers, newVideosFor],
  );

  const addItemstomenteeCategory = async (menteeEntry, entries) => {
    const mentee = menteeEntry.user;
    const menteeKey = `[MENTEE_CAT_Filter] ${mentee.full_name} (${mentee.email}) [MENTEE_CAT_Filter]`;

    try {
      const defaultColor = '#007AFF';
      const categoryId = await addCategory(menteeKey, defaultColor);
      // Only what was actually assigned to this mentee. It used to file every
      // selected item under every selected mentee, so a selection carrying a
      // notebook or an unshareable device file put those in the mentee's
      // category too — headings claiming the mentee had things that were never
      // sent to them.
      for (const entry of entries) {
        await addItemToCategory(categoryId, entry.id, entry.subtype || entry.type);
      }
    } catch (catErr) {
      console.error(
        `Error creating category or adding items for ${menteeKey}`,
        catErr,
      );
    }
  };

  // The mentee plays the Drive copy with their own Google account, so their
  // account has to be allowed to read it. The copy is private to the mentor —
  // deliberately, because the alternative was a link anyone could open — which
  // leaves exactly this to do at the moment of assigning.
  //
  // Assigning is the consent. The mentor picked these people and picked this
  // file for them to watch, which is the whole meaning of the action; asking
  // again here would be asking them to confirm what they just did.
  //
  // Failures are collected rather than thrown. One mentee's permission failing
  // must not cost the other mentees their assignment, and a file that is
  // already shared with someone answers with an error this treats the same way
  // — the end state is the one we wanted either way.
  const grantMenteeAccess = async (driveCopyIds, emails) => {
    const failures = [];

    await Promise.all(
      driveCopyIds.flatMap(fileId =>
        emails.map(async email => {
          try {
            await grantReaderAccess(fileId, email);
          } catch (error) {
            console.warn(`Could not grant ${email} access:`, error?.message);
            failures.push(email);
          }
        }),
      ),
    );

    return [...new Set(failures)];
  };

  const postAssignment = async (emails, videos) => {
    const response = await fetch(`${BASE_URL}/assign/assign_videos_to_mentees/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        mentor_id: userInfo.id,
        mentee_gmails: emails,
        videos,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }
  };

  const shareWithMentees = async () => {
    if (!userInfo?.id || selectedUsers.length === 0 || sendable.length === 0) {
      console.warn('Missing mentor ID, selected mentees, or assignable items.');
      return;
    }

    // Different mentees can be owed different items, so one flat request no
    // longer describes the work: the endpoint takes a list of mentees and a
    // list of videos and crosses them. Mentees owed exactly the same set are
    // batched into one request — which is every mentee, in the common case
    // where nobody has any of it yet — and a mentee owed nothing is left out
    // entirely rather than being sent duplicates.
    const groups = new Map();
    for (const menteeEntry of selectedUsers) {
      const entries = newVideosFor(menteeEntry);
      if (entries.length === 0) continue;

      const signature = entries
        .map(entry => entry.key)
        .sort()
        .join('|');
      const group = groups.get(signature);
      if (group) {
        group.mentees.push(menteeEntry);
      } else {
        groups.set(signature, {mentees: [menteeEntry], entries});
      }
    }

    if (groups.size === 0) {
      Alert.alert(
        'Nothing new to send',
        selectedUsers.length === 1
          ? 'This mentee already has everything you picked.'
          : 'Every mentee you picked already has all of these items.',
      );
      return;
    }

    setAssigning(true);
    try {
      const accessFailures = new Set();
      const failedGroups = [];
      let assignedMentees = 0;
      let assignedPairs = 0;

      for (const {mentees: groupMentees, entries} of groups.values()) {
        const emails = groupMentees.map(m => m.user.email).filter(Boolean);
        const driveCopyIds = entries
          .map(entry => entry.driveCopyId)
          .filter(Boolean);

        // Before the assignment is recorded, so that a mentee opening it the
        // moment it lands can already play it. A permission granted for an
        // assignment that then fails to send is a mentee able to read a file
        // nobody told them about, which is the harmless end of this trade.
        const failures = await grantMenteeAccess(driveCopyIds, emails);
        failures.forEach(email => accessFailures.add(email));

        try {
          await postAssignment(
            emails,
            entries.map(entry => entry.payload),
          );
        } catch (error) {
          console.warn('Assign request failed:', error?.message ?? error);
          failedGroups.push(...groupMentees);
          continue;
        }

        for (const menteeEntry of groupMentees) {
          await addItemstomenteeCategory(menteeEntry, entries);
          // Remembered so a second press cannot re-send what this one just
          // sent — the screen stays open on a partial failure, and the rows
          // have to tell the truth about what already went.
          const menteeKey = String(menteeIdOf(menteeEntry));
          const map = assignmentsByMentee.current[menteeKey] ?? {};
          for (const entry of entries) {
            map[String(entry.id)] = {video_id: entry.id, status: 'pending'};
            if (entry.driveCopyId) {
              map[String(entry.driveCopyId)] = {
                video_id: entry.driveCopyId,
                origin_video_id: entry.id,
                status: 'pending',
              };
            }
          }
          assignmentsByMentee.current[menteeKey] = map;
        }

        assignedMentees += groupMentees.length;
        assignedPairs += groupMentees.length * entries.length;
      }

      setAssignmentsVersion(v => v + 1);

      // Every group failed: nothing was sent, so this is the network-error
      // case and the selection is worth keeping.
      if (assignedMentees === 0) {
        Alert.alert(
          'Could not assign',
          'The assignment could not be sent. Your selection has been kept.',
        );
        return;
      }

      if (failedGroups.length > 0) {
        Alert.alert(
          'Some mentees were not assigned',
          `${failedGroups.map(m => m.user.email).join('\n')}\n\nThe rest went ` +
            'through. Press Assign again to retry just these — the ones that ' +
            'succeeded will not be sent twice.',
        );
      }

      // Named, because the assignment did arrive and will sit there unplayable
      // for these people until the permission exists. Silence would leave the
      // mentor believing it worked and the mentee staring at a file that will
      // not open, with neither able to see why.
      if (accessFailures.size > 0) {
        Alert.alert(
          'Some mentees cannot open the file yet',
          `${[...accessFailures].join('\n')}\n\nThe assignment was sent, but ` +
            'access to your Drive copy could not be granted. Assign it again ' +
            'once you are back online, or share the file with them from Drive.',
        );
      }

      const skippedParts = [];
      if (summary.noCopy > 0) {
        skippedParts.push(`${summary.noCopy} not in your Drive`);
      }
      if (summary.unsupported > 0) {
        skippedParts.push(`${summary.unsupported} unsupported`);
      }
      if (menteesWithNothingNew > 0) {
        skippedParts.push(
          `${menteesWithNothingNew} mentee(s) already had everything`,
        );
      }
      ToastAndroid.show(
        `Assigned ${assignedPairs} item(s) to ${assignedMentees} mentee(s).` +
          (skippedParts.length ? ` Skipped: ${skippedParts.join(', ')}.` : ''),
        ToastAndroid.LONG,
      );

      // Cleared only when the whole thing went through. A partial failure
      // leaves the selection and the screen in place so the retry above means
      // something.
      if (failedGroups.length > 0) return;

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

  // Nothing new to send is a state, not an error: pressing Assign on it would
  // do nothing, so the button says so instead of pretending it will work.
  const nothingToSend = sendable.length === 0;
  const nothingNew = selectedUsers.length > 0 && totalNewPairs === 0;
  const sendDisabled = assigning || nothingToSend || nothingNew;

  // On every mentee's row, picked or not: how much of this selection they
  // would actually be getting. It is what turns the list into something you
  // read before choosing rather than a list of names you check afterwards.
  //
  // On *every* row, including the ones with nothing in common with the
  // selection. That case was left blank at first, on the theory that a badge
  // saying "all of it is new" says nothing — but it is the common case, so the
  // column was empty exactly when a mentor first went looking for it, and an
  // empty row is indistinguishable from a badge that has not loaded. A number
  // on every row is a column you can scan down.
  const renderMenteeBadge = useCallback(
    mentee => {
      if (sendable.length === 0) return null;

      const newCount = newCountFor(mentee);
      // Not known yet, or the request failed. Either way the screen has no
      // business claiming anything about this person.
      if (newCount === null) return null;

      if (newCount === 0) {
        return (
          <View style={[styles.menteeBadge, styles.menteeBadgeDone]}>
            <Ionicons name="checkmark-done" size={12} color="#1d4ed8" />
            <Text style={[styles.menteeBadgeText, {color: '#1d4ed8'}]}>
              {sendable.length === 1 ? 'Has it' : 'Has all'}
            </Text>
          </View>
        );
      }

      // One label, whether or not this mentee already has part of the
      // selection. It briefly said "3 new" for a partial overlap and "3 items"
      // for none — two sentences for the identical fact that three items would
      // be sent, distinguished only by a word swap with nothing on screen to
      // decode it. The cue was invisible anyway: three items out of a
      // three-item selection rendered as "3 items", so the word only ever
      // changed when the number was already smaller than what was picked.
      //
      // "New" is the true half of it — new to this mentee, i.e. not already
      // assigned — and it is the same idea the blue badge states when the
      // count is zero.
      return (
        <View style={[styles.menteeBadge, styles.menteeBadgeNew]}>
          <Text
            style={[
              styles.menteeBadgeText,
              styles.menteeBadgeTextAlone,
              {color: '#047857'},
            ]}>
            {newCount} new
          </Text>
        </View>
      );
    },
    [sendable.length, newCountFor],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>Assign to</Text>
          {mentees.length > 0 && (
            <TouchableOpacity onPress={toggleSelectAll} disabled={assigning}>
              <Text
                style={[styles.selectAll, assigning && styles.selectAllDisabled]}>
                {allSelected ? 'Clear' : 'Select all'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.headerSub}>
          {selectedUsers.length > 0
            ? `${selectedUsers.length} mentee${
                selectedUsers.length === 1 ? '' : 's'
              } selected`
            : 'Choose mentees below'}
        </Text>
      </View>

      {/* What is being assigned, item by item. The selection was made on a
          previous screen, so until this existed there was nothing here saying
          what was about to be sent, let alone what could not be. */}
      <AssignManifest
        plan={plan}
        summary={summary}
        duplicates={duplicates}
        loading={planLoading}
        checkingDuplicates={checkingDuplicates}
        checkFailed={checkFailed}
        menteeCount={selectedUsers.length}
        onRemove={removeEntry}
        onRemoveUnsendable={removeUnsendable}
        removable={!assigning}
      />

      <MenteeList renderTrailing={renderMenteeBadge} />

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

          {/* Who it is going to — and, when it is going to nobody, why.
              This briefly counted (item, mentee) pairs instead: "6 new
              assignments" for three items and two mentees, a unit that matched
              nothing else on the screen and that each mentee's own row already
              answers per person. The one thing the rows cannot say is why the
              button beside this text is dead, so that is what is left. */}
          <Text style={styles.selectionSummary} numberOfLines={2}>
            {nothingToSend
              ? 'Nothing here can be assigned'
              : nothingNew
              ? 'Already assigned to everyone picked'
              : selectedUsers.length === 1
              ? selectedUsers[0]?.user?.full_name ||
                selectedUsers[0]?.user?.email ||
                'Unnamed'
              : `${selectedUsers.length} mentees`}
          </Text>

          <TouchableOpacity
            style={[styles.fab, sendDisabled && styles.fabDisabled]}
            onPress={shareWithMentees}
            disabled={sendDisabled}>
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
              Assigning to {selectedUsers.length} mentee
              {selectedUsers.length === 1 ? '' : 's'}…
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
    color: '#374151',
  },

  menteeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 8,
  },
  menteeBadgeDone: {backgroundColor: '#eff6ff'},
  menteeBadgeNew: {backgroundColor: '#ecfdf5'},
  menteeBadgeText: {fontSize: 11, fontWeight: '700', marginLeft: 3},
  // The margin above sits between the icon and the label; without an icon it
  // is just an off-centre badge.
  menteeBadgeTextAlone: {marginLeft: 0},

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
