// import {useRoute} from '@react-navigation/core';
// import React, {useEffect, useState} from 'react';
// import {
//   View,
//   Text,
//   FlatList,
//   TouchableOpacity,
//   ActivityIndicator,
//   StyleSheet,
//   ScrollView,
// } from 'react-native';
// import Ionicons from 'react-native-vector-icons/Ionicons';
// import {BASE_URL} from '../../appMentorBackend/userMgt';
// import {fetchSentNotifications, formatNotification, updateNotificationCount} from '../notificationsMgt';
// import useNotificationStore from '../useNotificationStore';
// import { useAppState } from '../../contexts/AppStateContext';

// const NotificationList = () => {
//   const [requests, setRequests] = useState({
//     sent_requests: [],
//     received_requests: [],
//   });

//   const [loading, setLoading] = useState(true);
//   const [notifications, setNotifications] = useState([]);
//   const {userInfo} = useAppState();
//   const {notificationsCount} = useNotificationStore();

//   const fetchRequests = async () => {
//     setLoading(true);
//     try {
//       const res = await fetch(`${BASE_URL}/request/all/${userInfo?.id}/`);
//       const data = await res.json();
//       setRequests(data);
//     } catch (err) {
//       console.error(err);
//     }
//     setLoading(false);
//   };

//   const cancelRequest = async requestId => {
//     try {

//       await fetch(`${BASE_URL}/request/cancel/`, {
//         method: 'POST',
//         headers: {'Content-Type': 'application/json'},
//         body: JSON.stringify({request_id: requestId}),
//       });
//       fetchRequests();
//     } catch (err) {
//       console.error(err);
//     }
//   };

//   const respondRequest = async (requestId, action) => {
//     try {

//       await fetch(`${BASE_URL}/request/respond/`, {
//         method: 'POST',
//         headers: {'Content-Type': 'application/json'},
//         body: JSON.stringify({request_id: requestId, action}),
//       });
//       fetchRequests();
//     } catch (err) {
//       console.error(err);
//     }
//   };

//  useEffect(() => {
//   const loadData = async () => {
//     fetchRequests();
//     const data = await fetchSentNotifications();
//     setNotifications(data);
//   };

//   if (userInfo) {
//     loadData();
//   }
//   return () => {
//     updateNotificationCount(); // <-- runs only on unmount
//   };
// }, [userInfo,notificationsCount]);
//   if (loading) {
//     return <ActivityIndicator size="large" color="#007bff" />;
//   }

//   return (
//     <ScrollView contentContainerStyle={styles.container}>
//       <Text style={styles.sectionTitle}>Requests You Sent</Text>
//       {requests.sent_requests.length === 0 ? (
//         <Text style={styles.emptyText}>No sent requests.</Text>
//       ) : (
//         requests.sent_requests.map(item => (
//           <View key={item.id} style={styles.notificationCard}>
//             <View style={styles.notificationRow}>
//               {/* Message */}
//               <View style={styles.messageContainer}>
//                 {item.status === 'pending' ? (
//                   <Text style={styles.messageText}>
//                     You requested{' '}
//                     <Text style={styles.nameText}>
//                       {item.receiver.full_name}
//                     </Text>{' '}
//                     to be your <Text style={styles.roleText}>{item.type}</Text>.
//                   </Text>
//                 ) : (
//                   <Text style={styles.messageText}>
//                     <Text style={styles.nameText}>
//                       {item.receiver.full_name}
//                     </Text>{' '}
//                     is your <Text style={styles.roleText}>{item.type}</Text>.
//                   </Text>
//                 )}

//                 <Text style={styles.emailText}>{item.receiver.email}</Text>
//               </View>

//               {/* Cancel Button */}
//               {item.status === 'pending' && (
//                 <TouchableOpacity onPress={() => cancelRequest(item.id)}>
//                   <Ionicons name="close-circle" size={28} color="#dc3545" />
//                 </TouchableOpacity>
//               )}
//             </View>
//           </View>
//         ))
//       )}

//       <Text style={styles.sectionTitle}>Invitations You Received</Text>
//       {requests.received_requests.length === 0 ? (
//         <Text style={styles.emptyText}>No received invitations.</Text>
//       ) : (
//         requests.received_requests.map(item => (
//           <View key={item.id} style={styles.notificationCard}>
//             <View style={styles.notificationRow}>
//               {/* Message */}
//               <View style={styles.messageContainer}>
//                 <Text style={styles.messageText}>
//                   {item.status === 'pending' ? (
//                     <>
//                       <Text style={styles.nameText}>
//                         {item.sender.full_name}
//                       </Text>
//                       {' is requesting to be your '}
//                       <Text style={styles.roleText}>
//                         {item.type === 'mentor' ? 'mentee' : 'mentor'}
//                       </Text>
//                     </>
//                   ) : (
//                     <>
//                       <Text style={styles.nameText}>
//                         {item.sender.full_name}
//                       </Text>
//                       {' is now your '}
//                       <Text style={styles.roleText}>
//                         {item.type === 'mentor' ? 'mentee' : 'mentor'}
//                       </Text>
//                     </>
//                   )}
//                   .
//                 </Text>
//                 <Text style={styles.emailText}>{item.sender.email}</Text>
//               </View>

//               {/* Action Buttons */}
//               {item.status === 'pending' && (
//                 <View style={styles.actions}>
//                   <TouchableOpacity
//                     onPress={() => respondRequest(item.id, 'approve')}>
//                     <Ionicons
//                       name="checkmark-circle"
//                       size={28}
//                       color="#28a745"
//                     />
//                   </TouchableOpacity>
//                   <TouchableOpacity
//                     onPress={() => respondRequest(item.id, 'reject')}>
//                     <Ionicons name="close-circle" size={28} color="#dc3545" />
//                   </TouchableOpacity>
//                 </View>
//               )}
//             </View>
//           </View>
//         ))
//       )}

//       <Text style={styles.sectionTitle}>General Notifications</Text>
//       {!notifications || notifications.length === 0 ? (
//         <Text style={styles.emptyText}>No notifications yet.</Text>
//       ) : (
//         notifications.map(notification => (
//           <View key={notification.id} style={styles.notificationCard}>
//             <View style={styles.notificationRow}>
//               <View style={styles.messageContainer}>
//                 <Text style={styles.messageText}>
//                   {formatNotification(notification)}
//                 </Text>
//                 <Text style={styles.emailText}>
//                   {new Date(notification.created_at).toLocaleString()}
//                 </Text>
//               </View>
//             </View>
//           </View>
//         ))
//       )}
//     </ScrollView>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     padding: 15,
//     paddingBottom: 30,
//     backgroundColor:'#fff',
//     flex:1
//   },
//   sectionTitle: {
//     fontSize: 20,
//     fontWeight: 'bold',
//     marginVertical: 15,
//     color: '#333',
//   },
//   emptyText: {
//     fontStyle: 'italic',
//     color: '#777',
//     marginBottom: 10,
//   },
//   notificationCard: {
//     paddingVertical: 10,
//     paddingHorizontal: 15,
//     borderBottomWidth: 0.5,
//     borderColor: '#ddd',
//     backgroundColor: '#fff',
//   },
//   notificationRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   avatar: {
//     width: 48,
//     height: 48,
//     borderRadius: 24,
//     marginRight: 12,
//     backgroundColor: '#ccc',
//   },
//   messageContainer: {
//     flex: 1,
//   },
//   messageText: {
//     fontSize: 15,
//     color: '#000',
//   },
//   nameText: {
//     fontWeight: '600',
//   },
//   roleText: {
//     fontWeight: 'bold',
//     color: '#007bff',
//   },
//   emailText: {
//     fontSize: 12,
//     color: '#666',
//     marginTop: 2,
//   },
//   actions: {
//     flexDirection: 'row',
//     gap: 10,
//     marginLeft: 8,
//   },
// });

// export default NotificationList;
// screens/NotificationList.js
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {SectionList, Text, StyleSheet, View} from 'react-native';
import {
  fetchSentNotifications,
  markNotificationsAsViewed,
  updateNotificationCount,
} from '../notificationsMgt';
import useNotificationStore from '../useNotificationStore';
import {useAppState} from '../../contexts/AppStateContext';
import {BASE_URL, fetchNewConnections} from '../../appMentorBackend/userMgt';
import NotificationPermissionBanner from '../components/NotificationPermissionBanner';
import NotificationRow from './NotificationRow';
import {styles as rowStyles} from './styles';
import DotsLoader from '../../components/DotsLoader';

const NotificationList = () => {
  const [requests, setRequests] = useState({
    sent_requests: [],
    received_requests: [],
  });
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const {userInfo} = useAppState();
  const {notificationsCount} = useNotificationStore();
  // Only the newest load may clear the spinner. Two can overlap — a count
  // change lands while the first is still in flight — and without this the one
  // that finishes first uncovers a screen the other has not filled in yet.
  const loadIdRef = useRef(0);
  // The request row currently being acted on. Its own spinner covers the POST
  // and the refresh that follows, which is why those reloads are silent — a
  // full-screen overlay on top of a row spinner says the same thing twice.
  const [pendingRequestId, setPendingRequestId] = useState(null);

  // Deliberately does not touch `loading`: it is one half of a load, and
  // owning the flag here is what used to end it early.
  const fetchRequests = async () => {
    try {
      const res = await fetch(`${BASE_URL}/request/all/${userInfo?.id}/`);
      const data = await res.json();
      setRequests(data);
    } catch (err) {
      console.error(err);
    }
  };

  const cancelRequest = async requestId => {
    setPendingRequestId(requestId);
    try {
      await fetch(`${BASE_URL}/request/cancel/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({request_id: requestId}),
      });
      await loadData({showLoader: false});
    } catch (err) {
      console.error(err);
    } finally {
      setPendingRequestId(null);
    }
  };

  const respondRequest = async (requestId, action) => {
    setPendingRequestId(requestId);
    try {
      await fetch(`${BASE_URL}/request/respond/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({request_id: requestId, action}),
      });
      if (action === 'approve') {
        await fetchNewConnections();
      }
      await loadData({showLoader: false});
    } catch (err) {
      console.error(err);
    } finally {
      setPendingRequestId(null);
    }
  };

  // No loadData here — the notificationsCount effect below already runs on
  // mount, and having both fire meant two concurrent loads every time.
  useEffect(() => {
    return () => {
      const onUnmount = async () => {
        try {
          await markNotificationsAsViewed();
          await updateNotificationCount();
        } catch (err) {
          console.error('Error on unmount:', err);
        }
      };
      onUnmount();
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [notificationsCount]);

  // Requests and notifications come from different tables whose ids overlap,
  // so each row carries the `kind` that says how to render it and what to key
  // it by. Grouped rather than interleaved by time: "act on this" and "here is
  // what happened" are different things to read, and a strict chronology would
  // bury a pending request under whatever arrived after it.
  //
  // Empty groups are left out entirely — a SectionList still draws a header for
  // a section with no rows.
  const sections = useMemo(() => {
    const grouped = [];

    if (requests.sent_requests.length) {
      grouped.push({
        title: 'Requests you sent',
        data: requests.sent_requests.map(r => ({...r, kind: 'sent_request'})),
      });
    }

    if (requests.received_requests.length) {
      grouped.push({
        title: 'Requests for you',
        data: requests.received_requests.map(r => ({
          ...r,
          kind: 'received_request',
        })),
      });
    }

    const general = notifications
      .filter(n => n.type !== 'mentor' && n.type !== 'mentee')
      .map(n => ({...n, kind: 'notification'}));

    if (general.length) {
      grouped.push({title: 'Notifications', data: general});
    }

    return grouped;
  }, [requests, notifications]);

  const loadData = async ({showLoader = true} = {}) => {
    const loadId = ++loadIdRef.current;
    if (showLoader) setLoading(true);

    try {
      await fetchRequests();
      const data = await fetchSentNotifications();
      if (loadId !== loadIdRef.current) return;
      setNotifications(data);
    } finally {
      // Cleared unconditionally, not just when this load raised it: a silent
      // reload that overtakes a loud one still has to put the overlay down, or
      // the loud one's own finally would see a stale id and leave it up.
      if (loadId === loadIdRef.current) setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, {marginHorizontal: 15}]}>
      <SectionList
        sections={sections}
        keyExtractor={item => `${item.kind}-${item.id}`}
        renderItem={({item}) => (
          <NotificationRow
            item={item}
            pending={pendingRequestId === item.id}
            onCancel={cancelRequest}
            onRespond={respondRequest}
          />
        )}
        renderSectionHeader={({section}) => (
          <Text style={rowStyles.sectionHeader}>{section.title}</Text>
        )}
        // Off so both platforms look the same — it defaults on for iOS only,
        // and with groups this short there is nothing to stick past.
        stickySectionHeadersEnabled={false}
        // In the header rather than above the list: it answers a question about
        // notification settings, so it shows before the fetches resolve, and it
        // scrolls with the content instead of pinning to the top.
        ListHeaderComponent={<NotificationPermissionBanner />}
        ListEmptyComponent={
          loading ? null : (
            <Text style={rowStyles.emptyText}>You are Up to Date!!</Text>
          )
        }
      />

      {loading && <DotsLoader overlay />}
    </View>
  );
};

const styles = StyleSheet.create({
  // The overlay is absolutely positioned against this, so it has to fill the
  // screen — otherwise it would only cover the height of whatever content
  // happens to have loaded, which on a first load is nothing.
  screen: {
    flex: 1,
  },
  container: {
    padding: 15,
    paddingBottom: 30,
    backgroundColor: '#fff',
    marginHorizontal: 16,
    // flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 15,
    color: '#333',
  },
});

export default NotificationList;
