import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { backgroundMessageHandler } from './src/services/NotificationService';

// Register background/headless notification handler for Push Notifications
try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    if (typeof backgroundMessageHandler === 'function') {
      return backgroundMessageHandler(remoteMessage);
    }
    return Promise.resolve();
  });
} catch (error) {
  console.warn('[FCM Setup] Failed to register background message handler:', error);
}

// Register root components (must be called unconditionally)
AppRegistry.registerComponent('LaporKampusNative', () => App);
AppRegistry.registerComponent('LaporKampus', () => App);
AppRegistry.registerComponent('main', () => App);
