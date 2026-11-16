import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import reportApi from '../api/reportApi';

// Storage Key for offline draft queue
export const OFFLINE_REPORTS_KEY = '@lapor_kampus_offline_reports_queue';

// Internal lock to prevent overlapping sync executions
let isSyncing = false;

/**
 * Checks current network connectivity asynchronously.
 * @returns {Promise<boolean>} Resolves to true if device is connected & internet reachable.
 */
export const checkIsOnline = async () => {
  try {
    const netState = await NetInfo.fetch();
    return Boolean(netState.isConnected && netState.isInternetReachable !== false);
  } catch (error) {
    console.warn('[OfflineSync] Failed to verify network state, assuming offline:', error);
    return false;
  }
};

/**
 * Retrieve all pending draft reports from AsyncStorage.
 * @returns {Promise<Array<Object>>}
 */
export const getOfflineReports = async () => {
  try {
    const rawData = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    return rawData ? JSON.parse(rawData) : [];
  } catch (error) {
    console.error('[OfflineSync] Error reading offline reports from storage:', error);
    return [];
  }
};

/**
 * Persist an updated array of offline reports to AsyncStorage.
 * @param {Array<Object>} reports
 * @returns {Promise<void>}
 */
const saveOfflineReports = async (reports) => {
  try {
    await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(reports));
  } catch (error) {
    console.error('[OfflineSync] Error persisting offline reports queue:', error);
    throw error;
  }
};

/**
 * Save report payload as an offline draft in AsyncStorage.
 * @param {Object} reportPayload
 * @returns {Promise<Object>} The persisted draft metadata.
 */
export const saveReportDraftOffline = async (reportPayload) => {
  try {
    const existingQueue = await getOfflineReports();
    const draftItem = {
      id: `draft_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      payload: reportPayload,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      status: 'QUEUED_OFFLINE',
    };

    const updatedQueue = [...existingQueue, draftItem];
    await saveOfflineReports(updatedQueue);

    console.log('[OfflineSync] Report saved as offline draft:', draftItem.id);
    return draftItem;
  } catch (error) {
    console.error('[OfflineSync] Failed to save draft offline:', error);
    throw new Error('Gagal menyimpan draf laporan ke memori lokal.');
  }
};

/**
 * Core Helper: Check network state.
 * If online -> submits report directly via API.
 * If offline -> saves report payload as draft in AsyncStorage.
 *
 * @param {Object} reportPayload
 * @returns {Promise<{ mode: 'ONLINE'|'OFFLINE_SAVED', result: Object }>}
 */
export const submitOrQueueReport = async (reportPayload) => {
  const isOnline = await checkIsOnline();

  if (isOnline) {
    try {
      console.log('[OfflineSync] Online network detected. Sending report to server...');
      const response = await reportApi.submitReport(reportPayload);
      return {
        mode: 'ONLINE',
        result: response,
      };
    } catch (apiError) {
      // If server is unreachable or timeout occurs despite connected status, fallback to offline draft
      if (apiError.isNetworkError || apiError.status >= 500) {
        console.warn('[OfflineSync] Server unreachable. Falling back to offline queue...');
        const draft = await saveReportDraftOffline(reportPayload);
        return {
          mode: 'OFFLINE_SAVED',
          result: draft,
          fallbackReason: apiError.message,
        };
      }
      // Re-throw genuine client validation errors (e.g. 400 Bad Request)
      throw apiError;
    }
  } else {
    console.log('[OfflineSync] Offline detected. Saving report payload into AsyncStorage...');
    const draft = await saveReportDraftOffline(reportPayload);
    return {
      mode: 'OFFLINE_SAVED',
      result: draft,
    };
  }
};

/**
 * Synchronize all pending draft reports with the backend server.
 * Ensures non-blocking sequential processing and atomic updates.
 *
 * @returns {Promise<{ synced: number, failed: number, remaining: number }>}
 */
export const syncPendingReports = async () => {
  if (isSyncing) {
    console.log('[OfflineSync] Sync already in progress, skipping duplicate invocation.');
    return { synced: 0, failed: 0, remaining: 0 };
  }

  const isOnline = await checkIsOnline();
  if (!isOnline) {
    console.log('[OfflineSync] Device is still offline. Postponing sync.');
    return { synced: 0, failed: 0, remaining: 0 };
  }

  isSyncing = true;
  let syncedCount = 0;
  let failedCount = 0;

  try {
    const queue = await getOfflineReports();
    if (queue.length === 0) {
      isSyncing = false;
      return { synced: 0, failed: 0, remaining: 0 };
    }

    console.log(`[OfflineSync] Initiating sync for ${queue.length} pending reports...`);

    const remainingQueue = [];

    // Process drafts sequentially to prevent network flooding and thread lock
    for (const item of queue) {
      try {
        await reportApi.submitReport(item.payload);
        syncedCount += 1;
        console.log(`[OfflineSync] Successfully synced report draft: ${item.id}`);
      } catch (syncError) {
        console.error(`[OfflineSync] Failed to sync draft ${item.id}:`, syncError);
        failedCount += 1;
        // Keep in queue with incremented retry count
        remainingQueue.push({
          ...item,
          retryCount: (item.retryCount || 0) + 1,
          lastError: syncError.message,
        });
      }
    }

    await saveOfflineReports(remainingQueue);

    return {
      synced: syncedCount,
      failed: failedCount,
      remaining: remainingQueue.length,
    };
  } catch (error) {
    console.error('[OfflineSync] Fatal error during sync process:', error);
    throw error;
  } finally {
    isSyncing = false;
  }
};

/**
 * Initializes auto-sync listener that triggers background sync
 * whenever internet connectivity is restored.
 *
 * @param {Function} [onStatusCallback] Optional callback to notify UI of sync status
 * @returns {Function} Unsubscribe cleanup function
 */
export const initAutoSyncNetworkListener = (onStatusCallback) => {
  const unsubscribe = NetInfo.addEventListener(async (state) => {
    const isAvailable = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (isAvailable) {
      try {
        const syncResult = await syncPendingReports();
        if (onStatusCallback && syncResult.synced > 0) {
          onStatusCallback(syncResult);
        }
      } catch (err) {
        console.warn('[OfflineSync] Auto-sync listener encounter an issue:', err);
      }
    }
  });

  return unsubscribe;
};

export default {
  checkIsOnline,
  getOfflineReports,
  saveReportDraftOffline,
  submitOrQueueReport,
  syncPendingReports,
  initAutoSyncNetworkListener,
};
