import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  AppState,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import NetInfo from '@react-native-community/netinfo';
import useLocation from '../hooks/useLocation';
import { submitOrQueueReport, syncPendingReports, getOfflineReports } from '../utils/offlineSyncHelper';

const CATEGORIES = [
  'Fasilitas Kelas',
  'Kelistrikan & AC',
  'Sanitasi / Toilet',
  'Laboratorium',
  'Infrastruktur Gedung',
  'Lain-lain',
];

/**
 * Main UI Screen: Create Facility Report (Lapor Kampus)
 * Integrates:
 * - Vision Camera with AppState lifecycle management
 * - Custom GPS LBS hook with background pause
 * - Offline-first submission & AsyncStorage sync queue
 * - Modern functional components with hooks
 */
export const CreateReportScreen = ({ navigation, onLogout }) => {
  // -------------------------------------------------------------
  // Form State
  // -------------------------------------------------------------
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [roomDetails, setRoomDetails] = useState('');
  const [description, setDescription] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [offlineDraftCount, setOfflineDraftCount] = useState(0);

  // -------------------------------------------------------------
  // Network Connectivity State
  // -------------------------------------------------------------
  const [isOnline, setIsOnline] = useState(true);

  // -------------------------------------------------------------
  // Camera & Device State
  // -------------------------------------------------------------
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const cameraRef = useRef(null);
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const cameraDevice = useCameraDevice('back');

  // -------------------------------------------------------------
  // LBS: Custom Geolocation Hook
  // -------------------------------------------------------------
  const {
    location,
    error: locationError,
    loading: locationLoading,
    getLocation: refreshLocation,
  } = useLocation({ autoFetch: true, highAccuracy: true });

  // -------------------------------------------------------------
  // Lifecycle Management (AppState API)
  // Ensure Camera sensor is shut down when app is backgrounded or inactive
  // -------------------------------------------------------------
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      console.log(`[CreateReportScreen] AppState changed: ${nextAppState}`);
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Compute active state for Camera:
  // ONLY active when user opened camera view AND AppState is 'active'
  const isCameraActive = isCameraOpen && appState === 'active' && !capturedPhoto;

  // -------------------------------------------------------------
  // Network Listener & Offline Queue Counter
  // -------------------------------------------------------------
  useEffect(() => {
    // Monitor online/offline status
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
    });

    // Check count of pending offline drafts
    const checkOfflineCount = async () => {
      const drafts = await getOfflineReports();
      setOfflineDraftCount(drafts.length);
    };
    checkOfflineCount();

    return () => {
      unsubscribeNet();
    };
  }, []);

  // -------------------------------------------------------------
  // Camera Actions
  // -------------------------------------------------------------
  const handleOpenCamera = async () => {
    if (!hasCameraPermission) {
      const granted = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Izin Kamera Ditolak', 'Aplikasi membutuhkan akses kamera untuk memotret bukti fasilitas rusak.');
        return;
      }
    }
    setIsCameraOpen(true);
  };

  const handleCapturePhoto = async () => {
    if (cameraRef.current && isCameraActive) {
      try {
        const photo = await cameraRef.current.takePhoto({
          flash: 'off',
          enableShutterSound: false,
        });

        const formattedUri = Platform.OS === 'android' ? `file://${photo.path}` : photo.path;
        setCapturedPhoto(formattedUri);
        setIsCameraOpen(false);
      } catch (err) {
        console.error('[CreateReportScreen] Camera capture error:', err);
        Alert.alert('Gagal Mengambil Foto', err.message);
      }
    }
  };

  const handleRetakePhoto = () => {
    setCapturedPhoto(null);
    setIsCameraOpen(true);
  };

  // -------------------------------------------------------------
  // Form Submission & Offline Handling
  // -------------------------------------------------------------
  const handleSubmitReport = async () => {
    if (!title.trim()) {
      Alert.alert('Form Belum Lengkap', 'Silakan masukkan judul laporan fasilitas.');
      return;
    }
    if (!roomDetails.trim()) {
      Alert.alert('Form Belum Lengkap', 'Silakan tentukan gedung dan ruangan fasilitas.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Form Belum Lengkap', 'Silakan masukkan deskripsi detail kerusakan fasilitas.');
      return;
    }
    if (!capturedPhoto) {
      Alert.alert('Bukti Foto Diperlukan', 'Harap lampirkan foto bukti kondisi fasilitas kampus.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build Report Payload
      const reportPayload = {
        title: title.trim(),
        category,
        roomDetails: roomDetails.trim(),
        description: description.trim(),
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        accuracy: location?.accuracy || null,
        photoUri: capturedPhoto,
        submittedAt: new Date().toISOString(),
      };

      // Execute non-blocking offline-first submission
      const result = await submitOrQueueReport(reportPayload);

      if (result.mode === 'ONLINE') {
        Alert.alert(
          'Laporan Berhasil!',
          'Laporan fasilitas Anda telah berhasil terkirim ke sistem sarana prasarana kampus.',
          [{ text: 'OK', onPress: resetForm }]
        );
      } else {
        // Report was saved as offline draft in AsyncStorage
        Alert.alert(
          'Tersimpan Offline',
          'Koneksi internet tidak tersedia atau lemah. Laporan telah disimpan sebagai draf lokal dan akan disinkronkan otomatis saat online.',
          [{ text: 'Mengerti', onPress: resetForm }]
        );
      }

      // Update offline draft badge
      const drafts = await getOfflineReports();
      setOfflineDraftCount(drafts.length);
    } catch (err) {
      console.error('[CreateReportScreen] Submit Error:', err);
      Alert.alert('Gagal Mengirim Laporan', err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trigger manual background sync
  const handleManualSync = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Perangkat masih dalam kondisi offline. Harap periksa koneksi internet Anda.');
      return;
    }

    setIsSubmitting(true);
    try {
      const syncResult = await syncPendingReports();
      setOfflineDraftCount(syncResult.remaining);
      Alert.alert(
        'Sinkronisasi Selesai',
        `Berhasil menyinkronkan ${syncResult.synced} laporan draf. (Gagal: ${syncResult.failed})`
      );
    } catch (err) {
      Alert.alert('Sinkronisasi Gagal', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setCategory(CATEGORIES[0]);
    setRoomDetails('');
    setDescription('');
    setCapturedPhoto(null);
  };

  // -------------------------------------------------------------
  // Render Camera Modal Viewfinder
  // -------------------------------------------------------------
  if (isCameraOpen && cameraDevice) {
    return (
      <View style={styles.cameraContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={cameraDevice}
          isActive={isCameraActive}
          photo={true}
        />

        {/* Top Camera Controls */}
        <SafeAreaView style={styles.cameraHeader}>
          <TouchableOpacity
            style={styles.cameraCloseButton}
            onPress={() => setIsCameraOpen(false)}
          >
            <Text style={styles.cameraCloseText}>✕ Batal</Text>
          </TouchableOpacity>
        </SafeAreaView>

        {/* Bottom Shutter Action */}
        <View style={styles.cameraFooter}>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={handleCapturePhoto}
            activeOpacity={0.7}
          >
            <View style={styles.captureInnerCircle} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------
  // Render Main Form View
  // -------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      {/* Online/Offline Status Banner */}
      <View
        style={[
          styles.networkBanner,
          { backgroundColor: isOnline ? '#E6F4EA' : '#FCE8E6' },
        ]}
      >
        <Text style={[styles.networkBannerText, { color: isOnline ? '#137333' : '#C5221F' }]}>
          {isOnline
            ? '● Terhubung ke Server (Online)'
            : '● Mode Offline: Laporan akan disimpan di perangkat'}
        </Text>
        {offlineDraftCount > 0 && (
          <TouchableOpacity onPress={handleManualSync} disabled={!isOnline}>
            <Text style={styles.syncBadgeText}>
              ({offlineDraftCount} Draf Pending {isOnline ? '• Sinkronkan' : ''})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header Title */}
        <View style={styles.header}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.appTitle}>Lapor Kampus</Text>
              <Text style={styles.subtitle}>Pelaporan Kerusakan Fasilitas & Sarana Kampus</Text>
            </View>
            {onLogout && (
              <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
                <Text style={styles.logoutButtonText}>Keluar ↗</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 1. Judul Laporan */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Judul Laporan *</Text>
          <TextInput
            style={styles.input}
            placeholder="Contoh: AC Mati di Ruang Kuliah 203"
            value={title}
            onChangeText={setTitle}
            placeholderTextColor="#9AA0A6"
          />
        </View>

        {/* 2. Kategori Fasilitas */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Kategori Fasilitas</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryText, isSelected && styles.categoryTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 3. Gedung / Ruangan */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Lokasi Gedung & Ruang *</Text>
          <TextInput
            style={styles.input}
            placeholder="Contoh: Gedung Fasilkom Baru, Lt. 3, R. 301"
            value={roomDetails}
            onChangeText={setRoomDetails}
            placeholderTextColor="#9AA0A6"
          />
        </View>

        {/* 4. Koordinat GPS (LBS Sensor Integration) */}
        <View style={styles.fieldContainer}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Koordinat GPS Terkini</Text>
            <TouchableOpacity onPress={refreshLocation} disabled={locationLoading}>
              <Text style={styles.actionText}>
                {locationLoading ? 'Mencari...' : '↻ Perbarui GPS'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.locationCard}>
            {locationLoading ? (
              <View style={styles.rowCenter}>
                <ActivityIndicator size="small" color="#1A73E8" />
                <Text style={styles.locationTextSmall}> Mengakses sensor GPS satelit...</Text>
              </View>
            ) : location ? (
              <View>
                <Text style={styles.locationCoordinates}>
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </Text>
                <Text style={styles.locationAccuracy}>
                  Akurasi: ±{location.accuracy ? Math.round(location.accuracy) : 0} meter
                </Text>
              </View>
            ) : (
              <Text style={styles.locationErrorText}>
                {locationError || 'Lokasi belum terdeteksi. Pastikan GPS aktif.'}
              </Text>
            )}
          </View>
        </View>

        {/* 5. Foto Bukti Kerusakan (Camera Integration) */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Bukti Foto Fasilitas *</Text>
          {capturedPhoto ? (
            <View style={styles.photoPreviewWrapper}>
              <Image source={{ uri: capturedPhoto }} style={styles.photoPreview} />
              <TouchableOpacity style={styles.retakeButton} onPress={handleRetakePhoto}>
                <Text style={styles.retakeButtonText}>Ambil Ulang Foto</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.cameraPlaceholder} onPress={handleOpenCamera}>
              <Text style={styles.cameraIcon}>📷</Text>
              <Text style={styles.cameraPlaceholderTitle}>Buka Kamera & Ambil Bukti</Text>
              <Text style={styles.cameraPlaceholderSub}>
                Sensor kamera akan otomatis dijeda saat di background
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 6. Deskripsi Kerusakan */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Deskripsi Kerusakan *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Jelaskan kondisi kerusakan fasilitas secara terperinci..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor="#9AA0A6"
          />
        </View>

        {/* Tombol Kirim / Submit */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmitReport}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>
              {isOnline ? 'Kirim Laporan Fasilitas' : 'Simpan Draf (Offline)'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// -------------------------------------------------------------
// Component Stylesheet
// -------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  networkBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#DADCE0',
  },
  networkBannerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  syncBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A73E8',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FCE8E6',
    marginLeft: 8,
  },
  logoutButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C5221F',
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#202124',
  },
  subtitle: {
    fontSize: 14,
    color: '#5F6368',
    marginTop: 4,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3C4043',
    marginBottom: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 13,
    color: '#1A73E8',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#202124',
  },
  textArea: {
    minHeight: 100,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E8EAED',
    marginRight: 8,
  },
  categoryPillActive: {
    backgroundColor: '#1A73E8',
  },
  categoryText: {
    fontSize: 13,
    color: '#3C4043',
    fontWeight: '500',
  },
  categoryTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  locationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DADCE0',
    padding: 14,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationTextSmall: {
    fontSize: 13,
    color: '#5F6368',
  },
  locationCoordinates: {
    fontSize: 15,
    fontWeight: '700',
    color: '#202124',
  },
  locationAccuracy: {
    fontSize: 12,
    color: '#5F6368',
    marginTop: 2,
  },
  locationErrorText: {
    fontSize: 13,
    color: '#D93025',
  },
  cameraPlaceholder: {
    height: 160,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DADCE0',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cameraIcon: {
    fontSize: 36,
    marginBottom: 6,
  },
  cameraPlaceholderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A73E8',
  },
  cameraPlaceholderSub: {
    fontSize: 12,
    color: '#80868B',
    marginTop: 4,
    textAlign: 'center',
  },
  photoPreviewWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  photoPreview: {
    width: '100%',
    height: 220,
    resizeMode: 'cover',
  },
  retakeButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  retakeButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  submitButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#80868B',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraHeader: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
  },
  cameraCloseButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  cameraCloseText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  cameraFooter: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInnerCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
  },
});

export default CreateReportScreen;
