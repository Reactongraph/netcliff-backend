const OneSignal = require('@onesignal/node-onesignal');

// OneSignal configuration
const configuration = OneSignal.createConfiguration({
  restApiKey: process.env.ONESIGNAL_AUTH_KEY
});

const client = new OneSignal.DefaultApi(configuration);

// Reusable notification creator
const createNotification = (title, message, options = {}) => {
  const notification = new OneSignal.Notification();
  notification.app_id = process.env.ONESIGNAL_APP_ID;
  notification.headings = { en: title };
  notification.contents = { en: message };
  
  if (options.image) {
    notification.big_picture = options.image;
    notification.large_icon = options.image;
  }
  
  if (options.deepLink) {
    notification.data = { deepLink: options.deepLink };
    notification.url = options.deepLink;
  }
  
  // User targeting options (OneSignal requires at least one targeting method)
  if (options.externalUserIds && options.externalUserIds.length > 0) {
    notification.target_channel = 'push';
    notification.include_aliases = {
      external_id: options.externalUserIds
    };
  } else if (options.oneSignalUserIds && options.oneSignalUserIds.length > 0) {
    notification.target_channel = 'push';
    notification.include_aliases = {
      onesignal_id: options.oneSignalUserIds
    };
  } else {
    // Fallback to segments if no specific users provided
    notification.included_segments = options.segments || ['All'];
  }
  
  if (options.filters) {
    notification.filters = options.filters;
  }
  
  return notification;
};

module.exports = { OneSignal, client, createNotification };