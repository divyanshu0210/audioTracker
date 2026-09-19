// FocusCheck.jsx
//
// The attention check: a tap target that appears at an unpredictable moment and
// stops playback if nobody answers it.
//
// Sat over the player rather than in a modal on purpose. A modal would cover
// the note editor, and answering a check should never mean losing the sentence
// you were in the middle of - typing already answers it (see onPresenceSignal),
// so the only person who ever sees this is one who is not writing.
//
// It says what happens next rather than only asking. "Still watching?" alone
// reads as a question someone may ignore; a visible countdown to a pause is the
// same question with the consequence attached, and it is the consequence that
// makes it worth answering.

import React, {useEffect, useRef, useState} from 'react';
import {Animated, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const FocusCheck = ({visible, graceMs = 30000, onConfirm, compact = false}) => {
  const [secondsLeft, setSecondsLeft] = useState(Math.round(graceMs / 1000));
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    setSecondsLeft(Math.round(graceMs / 1000));
    // Faded in rather than snapped in. This arrives unannounced over something
    // the person is concentrating on, and a hard cut reads as an error.
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();

    const tick = setInterval(() => {
      setSecondsLeft(previous => (previous > 0 ? previous - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(tick);
      fade.setValue(0);
    };
  }, [visible, graceMs, fade]);

  if (!visible) return null;

  const countdown = secondsLeft > 0 ? `Pausing in ${secondsLeft}s` : 'Pausing…';

  // Generously sized in both layouts, because the failure this guards against
  // is a person who is there and misses it - that costs them their place in a
  // lecture, and a small target is how it happens.
  const button = (
    <TouchableOpacity
      style={[styles.button, compact && styles.buttonCompact]}
      onPress={onConfirm}
      accessibilityRole="button"
      accessibilityLabel="Confirm you are still watching">
      <Text style={styles.buttonText}>I'm here</Text>
    </TouchableOpacity>
  );

  // An audio player is AUDIO_MINIMIZED_RATIO of the screen against a video's
  // VIDEO_MINIMIZED_RATIO, and the stacked layout below does not fit in it -
  // icon, two lines and a button come to more than the whole player is tall.
  // Laid out along the row instead, where the constraint is width, of which
  // there is plenty.
  if (compact) {
    return (
      <Animated.View style={[styles.backdrop, {opacity: fade}]}>
        <View style={styles.rowCard}>
          <MaterialCommunityIcons name="eye-outline" size={20} color="#fff" />
          <View style={styles.rowText}>
            <Text style={styles.title}>Still watching?</Text>
            <Text style={styles.subtitle}>{countdown}</Text>
          </View>
          {button}
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.backdrop, {opacity: fade}]}>
      <View style={styles.card}>
        <MaterialCommunityIcons name="eye-outline" size={28} color="#fff" />
        <Text style={styles.title}>Still watching?</Text>
        <Text style={styles.subtitle}>{countdown}</Text>
        {button}
      </View>
    </Animated.View>
  );
};

export default React.memo(FocusCheck);

const styles = StyleSheet.create({
  // Over the video, not the whole screen: the notes below stay readable and
  // usable, and typing in them dismisses this anyway.
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  card: {
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 6,
  },
  // The short-player layout: one row, vertically centred, with the text column
  // free to shrink so a narrow screen takes it out of the button rather than
  // pushing the button off the edge.
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  rowText: {
    flexShrink: 1,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  subtitle: {
    color: '#c7c7c7',
    fontSize: 13,
  },
  button: {
    backgroundColor: '#1a73e8',
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 34,
    marginTop: 10,
  },
  // No top margin on the row layout - it is beside the text, not under it -
  // and tighter horizontally so it still fits a narrow phone.
  buttonCompact: {
    marginTop: 0,
    paddingVertical: 9,
    paddingHorizontal: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
