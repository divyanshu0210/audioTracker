// WebSocketManager.js
import {Alert, AppState} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {WS_BASE_URL} from '../appMentorBackend/userMgt';

class WebSocketManager {
  constructor(userId, onMessage) {
    this.userId = userId;
    this.onMessage = onMessage;
    this.socket = null;
    this.connected = false;
    this.reconnectDelay = 5000;
    this.url = `${WS_BASE_URL}/ws/notifications/${userId}/`;

    this.appState = AppState.currentState;
    AppState.addEventListener('change', this.handleAppStateChange);

    this.setupNetworkListener();
    this.connect();
  }

  connect = () => {
    if (this.socket || this.connected) return;

    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      console.log('[WS] Connected');
      this.connected = true;
    };

    this.socket.onmessage = event => {
      const data = JSON.parse(event.data);
      console.log('[WS] Message received:', data);
      this.onMessage?.(data);
    };

    this.socket.onclose = () => {
      console.log('[WS] Connection closed. Retrying...');
      this.connected = false;
      this.socket = null;
      this.retryConnection();
    };

    this.socket.onerror = error => {
      console.error('[WS] Error:', error.message);
      this.socket.close(); // triggers onclose
    };
  };

  retryConnection = () => {
    setTimeout(() => {
      if (!this.connected) this.connect();
    }, this.reconnectDelay);
  };

  setupNetworkListener = () => {
    NetInfo.addEventListener(state => {
      if (state.isConnected && !this.connected) {
        console.log('[WS] Network available, reconnecting...');
        this.connect();
      }
    });
  };

  handleAppStateChange = nextState => {
    if (this.appState === 'background' && nextState === 'active') {
      console.log('[WS] App resumed, reconnecting...');
      if (!this.connected) this.connect();
    }

    if (nextState === 'background') {
      console.log('[WS] App in background');
      // Optional: Pause or close socket here if needed
    }

    this.appState = nextState;
  };

  close = () => {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
    AppState.removeEventListener('change', this.handleAppStateChange);
  };
}

export default WebSocketManager;
