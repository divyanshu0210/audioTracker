// AssignmentStatusStrip.jsx
//
// The line under an item row when a mentor is looking at one mentee's
// assignments: whether it reached them, and which parts they have watched.
//
// Ticks follow the convention people already know from messaging apps - one
// tick for sent, two for delivered - because the distinction is the same one:
// the assignment exists on the server, versus the mentee's device has actually
// built it. The second tick is what the acknowledge step earns.
//
// The bar is deliberately the same one the report screen draws
// (report/VideoReportItem.jsx): a grey track with green stretches at their
// real offsets. A single filled percentage would answer "how much" while
// hiding "which parts", and for a lecture those are different questions - ten
// minutes at the start and ten scattered through it are not the same progress.
// Same data, same shape, so a mentor reading one has learned to read the other.

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import useAssignmentStatusStore from './useAssignmentStatusStore';

// Blue is reserved for the state a person caused. Delivered is the device
// reporting in, which is worth showing but is not the same claim.
const SEEN_COLOR = '#1a73e8';
const DELIVERED_COLOR = '#9aa0a6';
const PENDING_COLOR = '#9aa0a6';

const describe = status => {
  if (status === 'seen') {
    return {icon: 'check-all', color: SEEN_COLOR, label: 'Seen'};
  }
  if (status === 'delivered') {
    return {icon: 'check-all', color: DELIVERED_COLOR, label: 'Delivered'};
  }
  return {icon: 'check', color: PENDING_COLOR, label: 'Not received yet'};
};

// Watch figures only make sense once it has actually reached the device.
const hasArrived = status => status === 'delivered' || status === 'seen';

/**
 * Delivery state as a subtitle line, sat directly under a file's title.
 *
 * Rendered by the row components themselves rather than by BaseItem, because
 * that is the only way it lines up with the title: a YouTube row leads with a
 * 100px thumbnail and the others with a ~44px icon, so nothing outside the
 * row can indent to the text column for all of them.
 *
 * Reads the store itself so a row component only has to drop it in and pass an
 * id. Renders nothing at all unless a mentor has that mentee selected, which
 * is every screen but one.
 */
const AssignmentSubtitleBase = ({sourceId, isContainer = false}) => {
  const assignment = useAssignmentStatusStore(
    state => state.byVideoId[String(sourceId)],
  );

  if (!assignment) return null;

  const {status, percent} = assignment;
  const {icon, color, label} = describe(status);
  const arrived = hasArrived(status);

  return (
    <View style={styles.subtitle}>
      <MaterialCommunityIcons name={icon} size={14} color={color} />
      {/* The tick carries the colour; the words stay the same muted grey in
          both states. Two things shouting the status made the line compete
          with the title above it.
          The figure rides here rather than beside the bar, which is the row's
          bottom edge now and has no room for a label. It always carries the
          word "Watched", because a bare "0%" read as ambiguous, and a missing
          report counts as zero - "we don't know the duration" is not a
          distinction a mentor can act on.
          A playlist or a folder is the exception: it has no duration of its
          own, so any figure there would be invented. It gets delivery only. */}
      <Text style={styles.subtitleText}>
        {!arrived || isContainer
          ? label
          : `${label} · Watched ${Math.round(percent ?? 0)}%`}
      </Text>
    </View>
  );
};

export const AssignmentSubtitle = React.memo(AssignmentSubtitleBase);

const AssignmentStatusStrip = ({assignment}) => {
  if (!assignment) return null;

  const duration = assignment.duration;
  const intervals = assignment.intervals;
  // Segments need a duration to be placed against; the empty track still
  // shows without one. Every assigned row carries the bar so the set reads as
  // one list - rows appearing and disappearing a bar between them was harder
  // to scan than an empty track that plainly means nothing watched yet.
  const canPlot = duration > 0;

  return (
    <View style={styles.progressBar}>
      {canPlot &&
        intervals?.map(([start, end], index) => (
          <View
            key={index}
            style={[
              styles.segment,
              {
                left: `${(start / duration) * 100}%`,
                width: `${((end - start) / duration) * 100}%`,
              },
            ]}
          />
        ))}
    </View>
  );
};

export default React.memo(AssignmentStatusStrip);

const styles = StyleSheet.create({
  subtitle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  subtitleText: {
    fontSize: 11,
    color: '#9aa0a6',
    marginLeft: 4,
  },
  // Sat on the row's bottom edge rather than in a band of its own, the way
  // report/VideoReportItem.jsx puts it along the foot of its card - same
  // height, same track, same green. Absolute, so it costs the row no height.
  progressBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: '#ddd',
    overflow: 'hidden',
  },
  segment: {
    position: 'absolute',
    height: '100%',
    backgroundColor: '#4CAF50',
  },
});
