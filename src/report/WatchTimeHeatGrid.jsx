// WatchTimeHeatGrid.jsx
//
// When in the day this person actually watches, over the last week: seven rows
// of twenty-four cells, shaded by minutes watched in that hour.
//
// Distinct from every other view in the report tab, which all answer "how
// much". This one answers "when" - and the two come apart in ways worth
// seeing: the same weekly total looks very different spread across lunchtimes
// than piled into midnight on two nights.
//
// Fed by clock intervals recorded per session (see VideoTracker), not by the
// media positions the rest of the report is built on. Those say where in a
// lecture someone was, never what time it was for them.

import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';

// Four steps, not a continuous ramp. A gradient invites reading a precise
// value out of a colour, which nobody can do; bands say "none / a little /
// a fair amount / a lot", which is all this is claiming.
// One hue, light to dark, four steps off a single blue ramp. Sequential data
// gets a single-hue ramp: the eye reads "more" from depth, and the order comes
// from lightness rather than from remembering which colour meant what.
//
// Blue rather than green on purpose. Green/amber/red already means "against
// your target" in this tab - the calendar's achievement bands - and this grid
// is not a judgement. It says when the watching happened; midnight is not
// worse than noon. Borrowing those colours would read as a verdict.
//
// Steps chosen off the ramp and checked rather than eyeballed: lightness is
// strictly monotonic (0.63 / 0.37 / 0.19 / 0.06 relative luminance) and the
// worst adjacent pair separates at dE 13.9 under protanopia, so the bands stay
// distinguishable to colourblind readers.
const BANDS = [
  {min: 30, color: '#104281'},
  {min: 15, color: '#2a78d6'},
  {min: 5, color: '#6da7ec'},
  {min: 0.5, color: '#b7d3f6'},
];
// Neutral, so "nothing watched" is a different kind of thing from the palest
// blue rather than the bottom of the same scale.
const EMPTY_COLOR = '#F1F3F4';

const cellColor = minutes => {
  const band = BANDS.find(b => minutes >= b.min);
  return band ? band.color : EMPTY_COLOR;
};

// Every third hour, so the axis stays readable at this cell size.
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const WatchTimeHeatGrid = ({data, mentee}) => {
  const rows = useMemo(
    () =>
      (data ?? []).map(day => {
        // Parsed as parts rather than new Date(string): a bare 'YYYY-MM-DD' is
        // treated as UTC, which shows the wrong weekday letter for anyone east
        // or west of it.
        const [year, month, date] = day.date.split('-').map(Number);
        return {
          ...day,
          label: WEEKDAYS[new Date(year, month - 1, date).getDay()],
        };
      }),
    [data],
  );

  if (rows.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {mentee
          ? `When ${mentee.full_name?.split(' ')[0] ?? 'they'} watches`
          : 'When you watch'}
      </Text>

      {rows.map(row => (
        <View key={row.date} style={styles.row}>
          <Text style={styles.dayLabel}>{row.label}</Text>
          <View style={styles.cells}>
            {row.hours.map((minutes, hour) => (
              <View
                key={hour}
                style={[styles.cell, {backgroundColor: cellColor(minutes)}]}
              />
            ))}
          </View>
        </View>
      ))}

      <View style={styles.axis}>
        {/* Spacer matching dayLabel, so the ticks line up with the cells and
            not with the row's left edge. */}
        <View style={styles.dayLabelSpacer} />
        <View style={styles.cells}>
          {Array.from({length: 24}, (_, hour) => (
            <View key={hour} style={styles.tickSlot}>
              {HOUR_TICKS.includes(hour) && (
                <Text style={styles.tickText}>{hour}</Text>
              )}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

export default React.memo(WatchTimeHeatGrid);

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    elevation: 2,
  },
  heading: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  dayLabel: {
    width: 16,
    fontSize: 10,
    color: '#6b7280',
  },
  dayLabelSpacer: {
    width: 16,
  },
  // The cells share the row evenly, so the grid fits whatever width the card
  // has rather than assuming one.
  cells: {
    flex: 1,
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    height: 14,
    marginRight: 1,
    borderRadius: 2,
  },
  axis: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  tickSlot: {
    flex: 1,
    marginRight: 1,
  },
  tickText: {
    fontSize: 8,
    color: '#9ca3af',
  },
});
