// AssignManifest.jsx
//
// The list of what was selected, standing on the Assign screen itself.
//
// The selection is made somewhere else and nothing carried over but a count,
// so a mentor arriving here was being asked to commit to "7 items" without
// being shown which seven — and three of them might be notes that cannot be
// assigned at all. This is that list, with the reason beside anything that
// will not travel.
//
// Collapsed by default when everything is sendable: there is nothing to
// decide, and a wall of rows would push the mentee list off screen. It opens
// itself when something needs looking at.

import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import UserAvatar from './UserAvatar';
import {AssignStatus} from './assignPlan';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STATUS_STYLE = {
  [AssignStatus.READY]: {color: '#047857', bg: '#ecfdf5', icon: 'checkmark-circle'},
  [AssignStatus.NO_COPY]: {color: '#b45309', bg: '#fffbeb', icon: 'alert-circle'},
  [AssignStatus.UNSUPPORTED]: {color: '#6b7280', bg: '#f3f4f6', icon: 'remove-circle'},
};

// Already-assigned is not a property of the item — the same file is sendable
// to one mentee and a duplicate for another — so it is drawn over the top of
// whatever the item's own status is.
const DUPLICATE_STYLE = {color: '#1d4ed8', bg: '#eff6ff', icon: 'repeat'};

const statusLabel = entry => {
  if (entry.status === AssignStatus.READY) return 'Will be sent';
  if (entry.status === AssignStatus.NO_COPY) return 'Not shareable';
  return 'Cannot be assigned';
};

// Who already has this one, as faces rather than a fraction.
//
// "Already with 2 of 3" is a number the mentor then has to decode, and the
// only way to decode it was to unpick mentees one at a time and watch the
// count move. The faces are the answer, in the place the question is asked,
// and they are the same avatars the rows below and the bar at the bottom use —
// so recognising them costs nothing.
const MAX_FACES = 3;

const DuplicateChip = ({users}) => {
  const shown = users.slice(0, MAX_FACES);
  const overflow = users.length - shown.length;

  return (
    <View style={[styles.chip, {backgroundColor: DUPLICATE_STYLE.bg}]}>
      <Text style={[styles.chipText, styles.chipLead, {color: DUPLICATE_STYLE.color}]}>
        Already with
      </Text>
      <View style={styles.facepile}>
        {shown.map((user, index) => (
          <View
            key={user?.id ?? user?.email ?? index}
            // Ringed in the chip's own colour so overlapping faces stay
            // separable at this size.
            style={[styles.face, index > 0 && styles.faceOverlap]}>
            <UserAvatar user={user} size={20} />
          </View>
        ))}
        {overflow > 0 && (
          <View style={[styles.face, styles.faceOverlap, styles.faceOverflow]}>
            <Text style={styles.faceOverflowText}>+{overflow}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const Row = ({entry, duplicate, onRemove, removable}) => {
  const style = STATUS_STYLE[entry.status];
  const skipped = entry.status !== AssignStatus.READY;

  return (
    <View style={styles.row}>
      <Ionicons
        name={entry.icon}
        size={18}
        color={skipped ? '#9ca3af' : '#4b5563'}
        style={styles.rowIcon}
      />
      <View style={styles.rowText}>
        <Text
          numberOfLines={1}
          style={[styles.rowTitle, skipped && styles.rowTitleMuted]}>
          {entry.title}
        </Text>
        {/* The type is named on every row, not only the broken ones: a mentor
            looking at "Bhagavatam 1.2.6" cannot otherwise tell whether they
            picked the YouTube lecture or the file on their phone, and those
            two reach the mentee by completely different routes. */}
        <Text numberOfLines={2} style={styles.rowSub}>
          {entry.typeLabel}
          {entry.reason ? ` · ${entry.reason}` : ''}
        </Text>
      </View>
      {duplicate ? (
        <DuplicateChip users={duplicate.users} />
      ) : (
        <View style={[styles.chip, {backgroundColor: style.bg}]}>
          <Ionicons name={style.icon} size={13} color={style.color} />
          <Text style={[styles.chipText, {color: style.color}]}>
            {statusLabel(entry)}
          </Text>
        </View>
      )}

      {/* Telling a mentor that four of their eight items cannot be sent, and
          then making them walk back two screens to do anything about it, is
          half an answer. hitSlop rather than a bigger box: the row is 30-odd
          points tall and the touch target has to be thumb-sized without the
          cross itself shouting louder than the status beside it. */}
      <TouchableOpacity
        onPress={() => onRemove(entry)}
        disabled={!removable}
        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
        style={styles.remove}>
        <Ionicons
          name="close"
          size={16}
          color={removable ? '#9ca3af' : '#e5e7eb'}
        />
      </TouchableOpacity>
    </View>
  );
};

const Pill = ({color, bg, text}) => (
  <View style={[styles.pill, {backgroundColor: bg}]}>
    <Text style={[styles.pillText, {color}]}>{text}</Text>
  </View>
);

const AssignManifest = ({
  plan,
  summary,
  duplicates,
  loading,
  checkingDuplicates,
  checkFailed,
  menteeCount,
  onRemove,
  onRemoveUnsendable,
  removable,
}) => {
  const needsAttention = summary.noCopy > 0 || summary.unsupported > 0;
  const [expanded, setExpanded] = useState(false);

  // Opened once, when a problem is found — not on every render that still has
  // one, or collapsing it would be impossible. The plan is built
  // asynchronously (a device file's eligibility is a database question), so
  // the first render has nothing to react to and the initial state cannot
  // carry this.
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (needsAttention && !autoOpened) {
      setExpanded(true);
      setAutoOpened(true);
    }
  }, [needsAttention, autoOpened]);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => !prev);
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color="#007AFF" />
        <Text style={styles.loadingText}>Checking what can be assigned…</Text>
      </View>
    );
  }

  // Nothing left at all — every row was removed from here. Distinct from
  // "nothing can be assigned", which is a selection that arrived unsendable.
  if (plan.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>
          Nothing selected. Go back and pick what you want to assign.
        </Text>
      </View>
    );
  }

  // Counted here rather than in `summary`, which is about the items alone:
  // this one depends on who is selected.
  const duplicateCount = Object.values(duplicates).filter(d => d?.all).length;
  const unsendable = summary.noCopy + summary.unsupported;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.headerRow}
        onPress={toggle}
        activeOpacity={0.7}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>
            {summary.ready === 0
              ? 'Nothing here can be assigned'
              : `${summary.ready} of ${summary.total} ${
                  summary.total === 1 ? 'item' : 'items'
                } can be assigned`}
          </Text>
          <View style={styles.pillRow}>
            {summary.noCopy > 0 && (
              <Pill
                color="#b45309"
                bg="#fffbeb"
                text={`${summary.noCopy} not shareable`}
              />
            )}
            {summary.unsupported > 0 && (
              <Pill
                color="#6b7280"
                bg="#f3f4f6"
                text={`${summary.unsupported} unsupported`}
              />
            )}
            {checkFailed && !checkingDuplicates && (
              <Pill
                color="#b45309"
                bg="#fffbeb"
                text="Could not check what mentees already have"
              />
            )}
            {checkingDuplicates ? (
              <Pill color="#1d4ed8" bg="#eff6ff" text="Checking mentees…" />
            ) : (
              duplicateCount > 0 && (
                <Pill
                  color="#1d4ed8"
                  bg="#eff6ff"
                  text={
                    menteeCount === 1
                      ? `${duplicateCount} already assigned`
                      : `${duplicateCount} already with everyone`
                  }
                />
              )
            )}
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#6b7280"
        />
      </TouchableOpacity>

      {/* Outside the header's TouchableOpacity, which toggles the list — a
          tap meant for this must not also collapse what it is talking about.
          Shown collapsed as well as expanded: it is the one action a mentor
          can take without reading the rows one by one. */}
      {unsendable > 0 && (
        <TouchableOpacity
          style={styles.bulkAction}
          onPress={onRemoveUnsendable}
          disabled={!removable}
          activeOpacity={0.7}>
          <Ionicons name="close-circle-outline" size={15} color="#b45309" />
          <Text style={styles.bulkActionText}>
            Remove the {unsendable} that cannot be sent
          </Text>
        </TouchableOpacity>
      )}

      {expanded && (
        // Capped rather than free-growing: a forty-item selection would
        // otherwise leave no mentee list to tap on, which is the one thing
        // this screen exists to do.
        <ScrollView
          style={styles.list}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled">
          {plan.map(entry => (
            <Row
              key={entry.key}
              entry={entry}
              duplicate={duplicates[entry.key]}
              onRemove={onRemove}
              removable={removable}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
};

export default AssignManifest;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  loadingText: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {flex: 1, marginRight: 8},
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  pill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
    marginTop: 4,
  },
  pillText: {fontSize: 11, fontWeight: '600'},

  list: {
    marginTop: 8,
    maxHeight: 220,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  rowIcon: {width: 22},
  rowText: {flex: 1, marginRight: 8},
  rowTitle: {fontSize: 13, fontWeight: '600', color: '#111827'},
  rowTitleMuted: {color: '#6b7280'},
  rowSub: {fontSize: 11, color: '#6b7280', marginTop: 1},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chipText: {fontSize: 11, fontWeight: '700', marginLeft: 3},
  chipLead: {marginLeft: 0, marginRight: 5},

  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 6,
  },
  bulkAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
  },
  bulkActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
    marginLeft: 5,
  },
  remove: {
    paddingLeft: 8,
    paddingVertical: 2,
  },

  facepile: {flexDirection: 'row', alignItems: 'center'},
  face: {
    borderWidth: 1.5,
    borderColor: '#eff6ff',
    borderRadius: 12,
  },
  faceOverlap: {marginLeft: -7},
  faceOverflow: {
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceOverflowText: {fontSize: 9, fontWeight: '700', color: '#1e3a8a'},
});
