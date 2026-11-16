import offlineSyncHelper, {
  OFFLINE_REPORTS_KEY,
  checkIsOnline,
  getOfflineReports,
  saveReportDraftOffline,
  submitOrQueueReport,
  syncPendingReports,
  initAutoSyncNetworkListener,
} from './src/utils/offlineSyncHelper';

export {
  OFFLINE_REPORTS_KEY,
  checkIsOnline,
  getOfflineReports,
  saveReportDraftOffline,
  submitOrQueueReport,
  syncPendingReports,
  initAutoSyncNetworkListener,
};

export default offlineSyncHelper;
