import React, { useState, useEffect } from 'react';
import { StatusBar, View, ActivityIndicator, StyleSheet } from 'react-native';
import CreateReportScreen from './src/screens/CreateReportScreen';
import LoginScreen from './src/screens/LoginScreen';
import notificationService from './src/services/NotificationService';
import { initAutoSyncNetworkListener } from './src/utils/offlineSyncHelper';
import { getAuthToken } from './src/api/apiClient';
import reportApi from './src/api/reportApi';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // 1. Cek Token JWT saat aplikasi pertama kali dibuka
  useEffect(() => {
    const checkUserSession = async () => {
      try {
        const token = await getAuthToken();
        setIsAuthenticated(Boolean(token));
      } catch (e) {
        console.warn('[App] Gagal memverifikasi sesi login:', e);
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkUserSession();
  }, []);

  // 2. Inisialisasi FCM & Auto-Sync
  useEffect(() => {
    notificationService.getFCMToken();
    notificationService.subscribeToTopic('ticket_updates');

    const cleanupNotifications = notificationService.initializeListeners({
      onForegroundMessage: (msg) => {
        console.log('[App] Notifikasi tiket diterima (Foreground):', msg);
      },
      onNotificationOpened: (msg) => {
        console.log('[App] Membuka notifikasi tiket:', msg);
      },
    });

    const cleanupAutoSync = initAutoSyncNetworkListener((syncResult) => {
      console.log('[App] Background auto-sync selesai:', syncResult);
    });

    return () => {
      cleanupNotifications();
      cleanupAutoSync();
    };
  }, []);

  const handleLogout = async () => {
    await reportApi.logout();
    setIsAuthenticated(false);
  };

  // Splash Loading Indicator saat memeriksa token di AsyncStorage
  if (isCheckingAuth) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <ActivityIndicator size="large" color="#1A73E8" />
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
      {isAuthenticated ? (
        <CreateReportScreen onLogout={handleLogout} />
      ) : (
        <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
