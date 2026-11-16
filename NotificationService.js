import notificationService, {
  FCM_TOKEN_STORAGE_KEY,
  backgroundMessageHandler,
} from './src/services/NotificationService';

export { FCM_TOKEN_STORAGE_KEY, backgroundMessageHandler };
export default notificationService;
