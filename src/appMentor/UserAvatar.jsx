// UserAvatar.jsx
//
// A user's Google profile picture, with initials as the fallback.
//
// The fallback is not an edge case: a Google account with no picture set hands
// back nothing, and a signed URL can fail or be slow. Initials on a
// deterministic colour keep the row the same shape and still tell two people
// apart, which a generic grey silhouette does not.

import React, {useState} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

// Fixed palette rather than a random colour per render — the same person keeps
// the same badge between screens and across app launches.
const COLORS = [
  '#1a73e8',
  '#d93025',
  '#188038',
  '#e37400',
  '#9334e6',
  '#0b8043',
  '#c5221f',
  '#1967d2',
];

const initialsOf = (name, email) => {
  const source = (name || '').trim() || (email || '').trim();
  if (!source) return '?';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
};

const colorFor = key => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
};

const UserAvatar = ({user, size = 40}) => {
  // A url that 404s or times out would otherwise leave a blank square, since
  // Image renders nothing on failure.
  const [failed, setFailed] = useState(false);

  const uri = user?.photo_url || user?.photo || null;
  const box = {width: size, height: size, borderRadius: size / 2};

  if (uri && !failed) {
    return (
      <Image
        source={{uri}}
        style={[styles.image, box]}
        onError={() => setFailed(true)}
      />
    );
  }

  const key = user?.email || user?.id?.toString() || user?.full_name || '';

  return (
    <View style={[styles.fallback, box, {backgroundColor: colorFor(key)}]}>
      <Text style={[styles.initials, {fontSize: size * 0.4}]}>
        {initialsOf(user?.full_name, user?.email)}
      </Text>
    </View>
  );
};

export default UserAvatar;

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#e5e7eb',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontWeight: '700',
  },
});
