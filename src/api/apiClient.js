import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys for JWT persistence
export const AUTH_TOKEN_KEY = '@lapor_kampus_jwt_token';
export const REFRESH_TOKEN_KEY = '@lapor_kampus_refresh_token';

// Base API configuration
const BASE_URL = 'https://api.laporkampus.ac.id'; // Replace with process.env.API_BASE_URL if configured
const TIMEOUT = 15000; // 15 seconds non-blocking timeout

/**
 * Configure Axios Client Instance
 */
const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/**
 * Async Helper: Retrieve stored JWT Token
 * @returns {Promise<string|null>}
 */
export const getAuthToken = async () => {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch (error) {
    console.error('[Auth Storage Error] Failed to retrieve JWT:', error);
    return null;
  }
};

/**
 * Async Helper: Store JWT Token
 * @param {string} token
 * @returns {Promise<void>}
 */
export const setAuthToken = async (token) => {
  try {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (error) {
    console.error('[Auth Storage Error] Failed to persist JWT:', error);
    throw error;
  }
};

/**
 * Async Helper: Remove JWT Token (Logout)
 * @returns {Promise<void>}
 */
export const removeAuthToken = async () => {
  try {
    await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY]);
  } catch (error) {
    console.error('[Auth Storage Error] Failed to remove JWT:', error);
  }
};

/**
 * REQUEST INTERCEPTOR:
 * Automatically retrieves the JWT Bearer token from local storage
 * and attaches it to the Authorization header asynchronously.
 */
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await getAuthToken();
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (storageError) {
      console.warn('[Request Interceptor] Token lookup warning:', storageError);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * RESPONSE INTERCEPTOR:
 * Handles centralized errors, token expiration (401), and non-blocking recovery.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized (Expired or Invalid JWT)
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      console.warn('[API Client] Unauthorized 401 - clearing expired credentials.');
      await removeAuthToken();

      // Optional: Emit event or navigate user back to login screen
    }

    // Standardize error message for consumption
    const formattedError = {
      status: error.response?.status || 500,
      message:
        error.response?.data?.message ||
        error.message ||
        'Terjadi kendala pada jaringan server.',
      data: error.response?.data || null,
      isNetworkError: !error.response,
    };

    return Promise.reject(formattedError);
  }
);

export default apiClient;
