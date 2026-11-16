import apiClient, { setAuthToken, removeAuthToken } from './apiClient';

/**
 * API Service for Lapor Kampus Authentication & Reports
 */
export const reportApi = {
  /**
   * User Login & JWT Token Retrieval
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>}
   */
  login: async (email, password) => {
    try {
      const response = await apiClient.post('/api/v1/auth/login', {
        email,
        password,
      });

      const { token, user } = response.data;
      if (token) {
        await setAuthToken(token);
      }

      return {
        success: true,
        user,
        token,
      };
    } catch (error) {
      console.error('[reportApi.login] Error during authentication:', error);
      throw error;
    }
  },

  /**
   * Submit Facility Issue Report
   * Supports standard JSON or FormData (for multipart image/photo upload)
   * @param {Object|FormData} reportData
   * @returns {Promise<Object>}
   */
  submitReport: async (reportData) => {
    try {
      const isFormData = typeof FormData !== 'undefined' && reportData instanceof FormData;
      
      const config = isFormData
        ? {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        : {};

      const response = await apiClient.post(
        '/api/v1/reports/create',
        reportData,
        config
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('[reportApi.submitReport] Failed to create report:', error);
      throw error;
    }
  },

  /**
   * Fetch Report Details by ID
   * @param {string|number} reportId
   * @returns {Promise<Object>}
   */
  getReportById: async (reportId) => {
    try {
      const response = await apiClient.get(`/api/v1/reports/${reportId}`);
      return response.data;
    } catch (error) {
      console.error(`[reportApi.getReportById] Failed to fetch report ${reportId}:`, error);
      throw error;
    }
  },

  /**
   * User Logout
   */
  logout: async () => {
    await removeAuthToken();
  },
};

export default reportApi;
