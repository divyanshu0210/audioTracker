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
import {AssignStatus} from './assignPlan';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const formatBytes = bytes => {
  const value = Number(bytes) || 0;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Already-assigned is not a property of the item — the same file is sendable
// to one mentee and a duplicate for another — so it is drawn over the top of
// whatever the item's own status is.
// Who already has this one, as faces rather than a fraction.
//
// "Already with 2 of 3" is a number the mentor then has to decode, and the
// only way to decode it was to unpick mentees one at a time and watch the
// count move. The faces are the answer, in the place the question is asked,
// and they are the same avatars the rows below and the bar at the bottom use —
// so recognising them costs nothing.
const Row = ({entry, onRemove, removable, consentGranted, onToggleConsent}) => {
  const approved = entry.status === AssignStatus.READY || consentGranted;
  const skipped = !approved;
  const showDeviceType =
    !(entry.status !== AssignStatus.READY && entry.typeLabel === 'On this phone');
  const displayTitle =
    entry.requiresConsent && entry.size
      ? `${entry.title} - ${formatBytes(entry.size)}`
      : entry.title;

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
          {displayTitle}
        </Text>
        {/* The type is named on every row, not only the broken ones: a mentor
            looking at "Bhagavatam 1.2.6" cannot otherwise tell whether they
            picked the YouTube lecture or the file on their phone, and those
            two reach the mentee by completely different routes. */}
        <Text numberOfLines={2} style={styles.rowSub}>
          {[showDeviceType ? entry.typeLabel : null, entry.reason]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <View style={styles.rowActions}>
        {entry.requiresConsent && (
          <TouchableOpacity
            onPress={() => onToggleConsent(entry.key)}
            disabled={!removable}
            style={[
              styles.consentToggle,
              consentGranted && styles.consentToggleGranted,
            ]}
            accessibilityRole="checkbox"
            accessibilityState={{checked: consentGranted}}>
            {!consentGranted && <Text style={styles.consentText}>Allow</Text>}

            <Ionicons
              name={consentGranted ? 'checkmark-circle' : 'ellipse-outline'}
              size={13}
              color={consentGranted ? '#047857' : '#9ca3af'}
            />
          </TouchableOpacity>
        )}
        {/* Telling a mentor that four of their eight items cannot be sent, and
            then making them walk back two screens to do anything about it, is
            half an answer. hitSlop rather than a bigger box: the row is 30-odd
            points tall and the touch target has to be thumb-sized without the
            cross itself shouting louder than the status beside it. */}
        <TouchableOpacity
          onPress={() => onRemove(entry)}
          disabled={!removable}
          hitSlop={{top: 10, bottom: 10, left: 4, right: 4}}
          style={styles.remove}>
          <Ionicons
            name="close"
            size={16}
            color={removable ? '#9ca3af' : '#e5e7eb'}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const SectionHeading = ({icon, color, title, action}) => (
  <View style={styles.sectionHeading}>
    <View style={styles.sectionHeadingLabel}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.sectionHeadingText, {color}]} numberOfLines={1}>
        {title}
      </Text>
    </View>
    {action}
  </View>
);

const AssignManifest = ({
  plan,
  summary,
  loading,
  onRemove,
  onRemoveUnsendable,
  removable,
  consentKeys,
  onToggleConsent,
  onApproveAllConsent,
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
  const consentEntries = plan.filter(entry => entry.requiresConsent);
  const pendingConsentEntries = consentEntries.filter(
    entry => !consentKeys?.has(entry.key),
  );
  const permanentlyUnsendableEntries = plan.filter(
    entry => entry.status !== AssignStatus.READY && !entry.requiresConsent,
  );
  const approvedConsentEntries = consentEntries.filter(entry =>
    consentKeys?.has(entry.key),
  );
  const readyEntries = plan.filter(
    entry => entry.status === AssignStatus.READY && !entry.requiresConsent,
  );
  const pendingConsent = pendingConsentEntries.length;
  const permanentlyUnsendable = permanentlyUnsendableEntries.length;
  const assignableCount = approvedConsentEntries.length + readyEntries.length;
  const warningCount = permanentlyUnsendable + pendingConsent;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.headerRow}
        onPress={toggle}
        activeOpacity={0.7}>
        <View style={styles.headerText}>
          <View style={styles.headerTitleRow}>
            {warningCount > 0 && (
              <Ionicons
                name="warning-outline"
                size={16}
                color="#b45309"
                style={styles.warningHeadingIcon}
              />
            )}
            <Text style={styles.headerTitle}>
              {pendingConsent > 0 && permanentlyUnsendable > 0
                ? `${pendingConsent} need approval · ${permanentlyUnsendable} can't be assigned`
                : pendingConsent > 0
                ? `${pendingConsent} ${pendingConsent === 1 ? 'item needs' : 'items need'} upload approval`
                : permanentlyUnsendable > 0
                ? `${permanentlyUnsendable} of ${summary.total} ${
                    summary.total === 1 ? 'item' : 'items'
                  } can't be assigned`
                : `${assignableCount} of ${summary.total} ${
                    summary.total === 1 ? 'item' : 'items'
                  } can be assigned`}
            </Text>
            </View>
          </View>
          <View style={styles.detailsToggle}>
            <Text style={styles.detailsToggleText}>
              Details
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#6b7280"
            />
          </View>
      </TouchableOpacity>

      {/* Outside the header's TouchableOpacity, which toggles the list — a
          tap meant for this must not also collapse what it is talking about.
          Shown collapsed as well as expanded: it is the one action a mentor
          can take without reading the rows one by one. */}
      {expanded && (
        <View>
          <ScrollView
            style={styles.list}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            persistentScrollbar
            keyboardShouldPersistTaps="handled">
            {consentEntries.length > 0 && (
              <SectionHeading
                icon="share-outline"
                color="#b45309"
                title={
                  pendingConsent > 0
                    ? `${pendingConsent} ${pendingConsent === 1 ? 'item needs' : 'items need'} approval${
                        approvedConsentEntries.length > 0
                          ? ` - ${approvedConsentEntries.length} approved`
                          : ''
                      }`
                    : `${approvedConsentEntries.length} approved for upload`
                }
                action={
                  pendingConsent > 0 ? (
                    <TouchableOpacity
                      style={[styles.sectionAction, styles.allowAllAction]}
                      onPress={onApproveAllConsent}
                      disabled={!removable}
                      activeOpacity={0.7}>
                      <Ionicons name="checkmark-done-outline" size={14} color="#047857" />
                      <Text style={styles.allowAllText}>Allow all</Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
            )}
            {consentEntries.map(entry => (
              <Row
                key={entry.key}
                entry={entry}
                onRemove={onRemove}
                removable={removable}
                consentGranted={consentKeys?.has(entry.key)}
                onToggleConsent={onToggleConsent}
              />
            ))}
            {permanentlyUnsendableEntries.length > 0 && (
              <SectionHeading
                icon="alert-circle-outline"
                color="#b91c1c"
                title={`${permanentlyUnsendable} ${permanentlyUnsendable === 1 ? 'item cannot be assigned' : 'items cannot be assigned'}`}
                action={(
                  <TouchableOpacity
                    style={[styles.sectionAction, styles.removeAllAction]}
                    onPress={onRemoveUnsendable}
                    disabled={!removable}
                    activeOpacity={0.7}>
                    <Ionicons name="close-circle-outline" size={14} color="#b91c1c" />
                    <Text style={styles.removeAllText}>Remove all</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            {permanentlyUnsendableEntries.map(entry => (
              <Row
                key={entry.key}
                entry={entry}
                onRemove={onRemove}
                removable={removable}
                consentGranted={false}
                onToggleConsent={onToggleConsent}
              />
            ))}
            {readyEntries.length > 0 && (
              <SectionHeading
                icon="checkmark-circle-outline"
                color="#047857"
                title={`${readyEntries.length} ${
                  readyEntries.length === 1 ? 'item can' : 'items can'
                } be assigned`}
              />
            )}
            {readyEntries.map(entry => (
              <Row
                key={entry.key}
                entry={entry}
                onRemove={onRemove}
                removable={removable}
                consentGranted={false}
                onToggleConsent={onToggleConsent}
              />
            ))}
          </ScrollView>
        </View>
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
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  detailsToggleText: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '600',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    flexShrink: 1,
  },
  warningHeadingIcon: {
    marginRight: 5,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  sectionHeadingLabel: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeadingText: {
    marginLeft: 5,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  allowAllAction: {
    backgroundColor: '#ecfdf5',
  },
  removeAllAction: {
    backgroundColor: '#fef2f2',
  },
  allowAllText: {
    marginLeft: 3,
    color: '#047857',
    fontSize: 10,
    fontWeight: '700',
  },
  removeAllText: {
    marginLeft: 3,
    color: '#b91c1c',
    fontSize: 10,
    fontWeight: '700',
  },
  list: {
    marginTop: 8,
    maxHeight: 220,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingRight: 20,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  rowIcon: {width: 22},
  rowText: {flex: 1, marginRight: 8},
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 4,
  },
  rowTitle: {fontSize: 13, fontWeight: '600', color: '#111827'},
  rowTitleMuted: {color: '#6b7280'},
  rowSub: {fontSize: 11, color: '#6b7280', marginTop: 1},
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 6,
  },
  remove: {
    paddingLeft: 8,
    paddingVertical: 2,
  },
  consentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  consentToggleGranted: {
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  consentText: {
    color: '#047857',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 2,
  },

});
