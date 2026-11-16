import { Platform, PermissionsAndroid, Alert } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FCM_TOKEN_STORAGE_KEY = '@lapor_kampus_fcm_token';

/**
 * Service for Firebase Cloud Messaging (FCM) Push Notifications.
 * Handles ticket status updates, foreground notifications, and background/killed state routing.
 */
class NotificationService {
  /**
   * Request User Permission for Push Notifications (iOS & Android 13+)
   * @returns {Promise<boolean>}
   */
  async requestUserPermission() {
    try {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }

      const authStatus = await messaging().requestPermission({
        alert: true,
        badge: true,
        sound: true,
      });

      const isEnabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      console.log('[NotificationService] FCM Authorization Status:', authStatus);
      return isEnabled;
    } catch (error) {
      console.error('[NotificationService] Failed to request notification permission:', error);
      return false;
    }
  }

  /**
   * Retrieve and store FCM Device Token for push notification targeting.
   * @returns {Promise<string|null>}
   */
  async getFCMToken() {
    try {
      const hasPermission = await this.requestUserPermission();
      if (!hasPermission) {
        console.warn('[NotificationService] Notification permission not granted.');
        return null;
      }

      // Check APNS registration on iOS first
      if (Platform.OS === 'ios' && !messaging().isDeviceRegisteredForRemoteMessages) {
        await messaging().registerDeviceForRemoteMessages();
      }

      const token = await messaging().getToken();
      if (token) {
        await AsyncStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
        console.log('[NotificationService] FCM Token registered:', token);
        return token;
      }
      return null;
    } catch (error) {
      console.error('[NotificationService] Error fetching FCM token:', error);
      return null;
    }
  }

  /**
   * Subscribe to specific facility ticket status update topics
   * @param {string} topicName
   */
  async subscribeToTopic(topicName = 'ticket_updates') {
    try {
      await messaging().subscribeToTopic(topicName);
      console.log(`[NotificationService] Subscribed to topic: ${topicName}`);
    } catch (error) {
      console.error(`[NotificationService] Failed to subscribe to topic ${topicName}:`, error);
    }
  }

  /**
   * Unsubscribe from specific topic
   * @param {string} topicName
   */
  async unsubscribeFromTopic(topicName) {
    try {
      await messaging().unsubscribeFromTopic(topicName);
      console.log(`[NotificationService] Unsubscribed from topic: ${topicName}`);
    } catch (error) {
      console.error(`[NotificationService] Failed to unsubscribe from topic ${topicName}:`, error);
    }
  }

  /**
   * Initialize all notification listeners (Foreground, Background, Cold Start)
   *
   * @param {Object} callbacks
   * @param {Function} [callbacks.onForegroundMessage] Callback when notification arrives in foreground
   * @param {Function} [callbacks.onNotificationOpened] Callback when user taps notification
   * @returns {Function} Cleanup function to unsubscribe listeners
   */
  initializeListeners({ onForegroundMessage, onNotificationOpened } = {}) {
    // 1. FOREGROUND MESSAGE HANDLER
    // Triggered when notification arrives while the app is actively open on screen
    const unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
      console.log('[NotificationService] Foreground notification received:', remoteMessage);

      const title = remoteMessage.notification?.title || 'Update Tiket Kampus';
      const body =
        remoteMessage.notification?.body || 'Status laporan fasilitas Anda telah diperbarui.';

      if (onForegroundMessage) {
        onForegroundMessage(remoteMessage);
      } else {
        // Fallback default in-app alert for ticket status
        Alert.alert(title, body, [{ text: 'OK' }]);
      }
    });

    // 2. BACKGROUND OPEN HANDLER
    // Triggered when user clicks/taps on notification and app was in background
    const unsubscribeOpenedApp = messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log(
        '[NotificationService] Notification opened from background state:',
        remoteMessage
      );

      if (onNotificationOpened) {
        onNotificationOpened(remoteMessage);
      }
    });

    // 3. COLD START / QUIT STATE HANDLER
    // Triggered when user opens the app from a completely closed (killed) state via notification
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          console.log(
            '[NotificationService] Notification opened from quit/cold-start state:',
            remoteMessage
          );
          if (onNotificationOpened) {
            onNotificationOpened(remoteMessage);
          }
        }
      })
      .catch((err) => {
        console.error('[NotificationService] Error checking initial notification:', err);
      });

    // 4. TOKEN REFRESH LISTENER
    const unsubscribeTokenRefresh = messaging().onTokenRefresh(async (newToken) => {
      console.log('[NotificationService] FCM Token refreshed:', newToken);
      await AsyncStorage.setItem(FCM_TOKEN_STORAGE_KEY, newToken);
      // Optional: sync new token to backend API: apiClient.post('/api/v1/users/device-token', { token: newToken })
    });

    // Return compound cleanup function
    return () => {
      unsubscribeForeground();
      unsubscribeOpenedApp();
      unsubscribeTokenRefresh();
    };
  }

  /**
   * Headless Background Message Handler.
   * MUST be registered in index.js outside the React component lifecycle.
   *
   * Example:
   * messaging().setBackgroundMessageHandler(NotificationService.backgroundMessageHandler);
   */
  async handleBackgroundMessage(remoteMessage) {
    console.log(
      '[NotificationService] Background/Headless notification received:',
      remoteMessage?.messageId
    );
    return Promise.resolve();
  }
}

export const backgroundMessageHandler = async (remoteMessage) => {
  console.log(
    '[NotificationService] Background/Headless notification received:',
    remoteMessage?.messageId
  );
  return Promise.resolve();
};

export const notificationService = new NotificationService();
notificationService.backgroundMessageHandler = backgroundMessageHandler;
export default notificationService;
