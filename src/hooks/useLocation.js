import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, PermissionsAndroid, AppState } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

/**
 * Custom Hook for Location-Based Services (LBS).
 * - Fetches precise GPS coordinates (Latitude, Longitude, Accuracy) asynchronously.
 * - Integrates React Native's AppState API to immediately stop GPS tracking
 *   when the app transitions to 'background' or 'inactive' to conserve battery.
 *
 * @param {Object} options Configuration options
 * @param {boolean} [options.autoFetch=true] Whether to fetch location automatically on mount
 * @param {boolean} [options.highAccuracy=true] Enable hardware GPS for high precision
 * @returns {Object} { location, error, loading, getLocation, startWatching, stopWatching, hasPermission }
 */
export const useLocation = ({ autoFetch = true, highAccuracy = true } = {}) => {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  const watchIdRef = useRef(null);
  const isWatchingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  /**
   * Request Location Permissions across Android and iOS
   */
  const requestLocationPermission = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') {
        const auth = await Geolocation.requestAuthorization('whenInUse');
        const granted = auth === 'granted';
        setHasPermission(granted);
        return granted;
      }

      if (Platform.OS === 'android') {
        const fineLocationGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Izin Lokasi Lapor Kampus',
            message:
              'Aplikasi membutuhkan koordinat GPS untuk mendeteksi lokasi fasilitas kampus yang dilaporkan.',
            buttonNeutral: 'Nanti',
            buttonNegative: 'Tolak',
            buttonPositive: 'Izinkan',
          }
        );

        const granted = fineLocationGranted === PermissionsAndroid.RESULTS.GRANTED;
        setHasPermission(granted);
        return granted;
      }

      return false;
    } catch (err) {
      console.error('[useLocation] Permission request failed:', err);
      setError('Gagal meminta izin akses GPS.');
      setHasPermission(false);
      return false;
    }
  }, []);

  /**
   * Asynchronously fetch current precise GPS coordinates (Latitude, Longitude)
   * Non-blocking Promise wrapper around Geolocation API.
   */
  const getLocation = useCallback(async () => {
    // Check if App is active to save resources
    if (appStateRef.current !== 'active') {
      console.warn('[useLocation] Cannot fetch GPS while app is in background.');
      return null;
    }

    setLoading(true);
    setError(null);

    const permitted = await requestLocationPermission();
    if (!permitted) {
      setLoading(false);
      setError('Izin akses lokasi ditolak oleh pengguna.');
      return null;
    }

    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            timestamp: position.timestamp,
          };
          setLocation(coords);
          setLoading(false);
          resolve(coords);
        },
        (err) => {
          console.error('[useLocation] Failed to get GPS coordinates:', err);
          const errorMessage =
            err.code === 1
              ? 'Izin lokasi tidak diberikan.'
              : err.code === 2
              ? 'GPS tidak terdeteksi atau provider mati.'
              : 'Waktu permintaan lokasi habis (timeout).';
          setError(errorMessage);
          setLoading(false);
          resolve(null);
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: 15000,
          maximumAge: 10000,
          forceRequestLocation: true,
          showLocationDialog: true,
        }
      );
    });
  }, [highAccuracy, requestLocationPermission]);

  /**
   * Stop active GPS watching and release hardware sensor
   */
  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      console.log('[useLocation] GPS watching stopped. Hardware sensor idle.');
    }
  }, []);

  /**
   * Start continuous GPS tracking (only when App is active)
   */
  const startWatching = useCallback(async () => {
    if (appStateRef.current !== 'active') {
      console.warn('[useLocation] Refusing to start GPS watch while inactive/background.');
      return;
    }

    const permitted = await requestLocationPermission();
    if (!permitted) return;

    stopWatching();
    isWatchingRef.current = true;

    watchIdRef.current = Geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          timestamp: position.timestamp,
        });
      },
      (err) => {
        console.error('[useLocation] GPS Watch error:', err);
        setError(err.message);
      },
      {
        enableHighAccuracy: highAccuracy,
        distanceFilter: 5, // Update every 5 meters
        interval: 5000,
        fastestInterval: 2000,
      }
    );
  }, [highAccuracy, requestLocationPermission, stopWatching]);

  /**
   * APP STATE LIFECYCLE MANAGEMENT:
   * Pause/disable GPS tracking when app moves to 'background' or 'inactive'.
   * Resume tracking when transitioning back to 'active'.
   */
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      const prevAppState = appStateRef.current;
      appStateRef.current = nextAppState;

      console.log(`[useLocation] AppState changed from ${prevAppState} -> ${nextAppState}`);

      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Pausing sensor to prevent background battery drain
        if (watchIdRef.current !== null) {
          console.log('[useLocation] Pausing GPS hardware tracker due to AppState background.');
          Geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      } else if (nextAppState === 'active' && prevAppState.match(/inactive|background/)) {
        // Resuming GPS tracking if watching was previously enabled
        if (isWatchingRef.current) {
          console.log('[useLocation] Resuming GPS hardware tracker as app resumed active state.');
          startWatching();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [startWatching]);

  /**
   * Initial mount setup & cleanup on unmount
   */
  useEffect(() => {
    if (autoFetch) {
      getLocation();
    }

    return () => {
      isWatchingRef.current = false;
      stopWatching();
    };
  }, [autoFetch, getLocation, stopWatching]);

  return {
    location,
    error,
    loading,
    hasPermission,
    getLocation,
    startWatching,
    stopWatching,
  };
};

export default useLocation;
