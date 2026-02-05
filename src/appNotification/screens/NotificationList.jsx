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
import React, {useEffect, useState} from 'react';
import {
  ScrollView,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';
import {
  fetchSentNotifications,
  markNotificationsAsViewed,
  updateNotificationCount,
} from '../notificationsMgt';
import useNotificationStore from '../useNotificationStore';
import {useAppState} from '../../contexts/AppStateContext';
import {BASE_URL, fetchNewConnections} from '../../appMentorBackend/userMgt';
import SentRequestsList from './SentRequestsList';
import ReceivedRequestsList from './ReceivedRequestsList';
import GeneralNotificationsList from './GeneralNotificationsList';

const NotificationList = () => {
  const [requests, setRequests] = useState({
    sent_requests: [],
    received_requests: [],
  });
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const {userInfo} = useAppState();
  const {notificationsCount} = useNotificationStore();

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/request/all/${userInfo?.id}/`);
      const data = await res.json();
      setRequests(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const cancelRequest = async requestId => {
    try {
      await fetch(`${BASE_URL}/request/cancel/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({request_id: requestId}),
      });
      fetchRequests();
    } catch (err) {
      console.error(err);
    }
  };

  const respondRequest = async (requestId, action) => {
    try {
      await fetch(`${BASE_URL}/request/respond/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({request_id: requestId, action}),
      });
      fetchRequests();
      if(action==='approve')
      {
        fetchNewConnections()
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData()
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

  const loadData = async () => {
    await fetchRequests();
    const data = await fetchSentNotifications();
    setNotifications(data);
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#007bff" />;
  }

  return (
    <View
      contentContainerStyle={styles.container}
      style={{marginHorizontal: 15}}>
      {requests.sent_requests.length > 0 && (
        <>
          <SentRequestsList
            sentRequests={requests.sent_requests}
            onCancel={cancelRequest}
          />
        </>
      )}

      {requests.received_requests.length > 0 && (
        <>
          <ReceivedRequestsList
            receivedRequests={requests.received_requests}
            onRespond={respondRequest}
          />
        </>
      )}

      {/* <Text style={styles.sectionTitle}>General Notifications</Text> */}
      <GeneralNotificationsList notifications={notifications} />
    </View>
  );
};

const styles = StyleSheet.create({
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
