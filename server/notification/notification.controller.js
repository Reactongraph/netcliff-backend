const Notification = require("./notification.model");

//import model
const User = require("../user/user.model");

// Firebase Admin SDK (initialized in util/privateKey)
const firebaseInitPromise = require("../../util/privateKey");
const firebaseAdmin = require("firebase-admin");

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const sendFcmMulticast = async ({ users, title, body, image, deepLink }) => {
  await firebaseInitPromise;

  const tokens = [
    ...new Set(
      (users || [])
        .map((u) => (u && u.fcmToken ? String(u.fcmToken).trim() : ""))
        .filter(Boolean)
    ),
  ];

  if (tokens.length === 0) {
    return {
      tokens: 0,
      successCount: 0,
      failureCount: 0,
      responses: [],
      message: "No FCM tokens found for targeted users.",
    };
  }

  const message = {
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      ...(deepLink ? { deepLink: String(deepLink) } : {}),
      ...(image ? { image: String(image) } : {}),
    },
    android: image
      ? {
          notification: { imageUrl: String(image) },
        }
      : undefined,
    apns: image
      ? {
          fcmOptions: { image: String(image) },
        }
      : undefined,
    webpush: deepLink
      ? {
          fcmOptions: { link: String(deepLink) },
        }
      : undefined,
  };

  const tokenChunks = chunk(tokens, 500);
  const results = [];

  for (const t of tokenChunks) {
    const resp = await firebaseAdmin.messaging().sendEachForMulticast({ ...message, tokens: t });
    results.push(resp);
  }

  const summary = results.reduce(
    (acc, r) => {
      acc.successCount += r.successCount || 0;
      acc.failureCount += r.failureCount || 0;
      acc.responses.push(...(r.responses || []));
      return acc;
    },
    { tokens: tokens.length, successCount: 0, failureCount: 0, responses: [] }
  );

  return summary;
};

//handle user notification true/false
exports.handleNotification = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(200).json({ status: false, message: "User does not found!!", user: {} });

    if (req.body.type === "GeneralNotification") {
      user.notification.GeneralNotification = !user.notification.GeneralNotification;
    }
    if (req.body.type === "NewReleasesMovie") {
      user.notification.NewReleasesMovie = !user.notification.NewReleasesMovie;
    }
    if (req.body.type === "AppUpdate") {
      user.notification.AppUpdate = !user.notification.AppUpdate;
    }
    if (req.body.type === "Subscription") {
      user.notification.Subscription = !user.notification.Subscription;
    }

    await user.save();

    return res.status(200).json({ status: true, message: "Success!", user });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get notification list
exports.getNotificationList = async (req, res) => {
  try {
    if (!req.user.userId) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details!" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(200).json({ status: false, message: "User does not found!" });
    }

    const notification = await Notification.find({ userId: user._id }).select("title message image date userId").sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "Retrive the notification list by the user!",
      notification,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//send Notification by admin
exports.sendNotifications = async (req, res) => {
  try {
    if (req.body.notificationType.trim() === "General Notification") {
      let users;
      
      // Check if specific user IDs are provided
      if (req.body.targetUserIds && req.body.targetUserIds.trim()) {
        const userIds = req.body.targetUserIds.split(',').map(id => id.trim()).filter(id => id);
        users = await User.find({ 
          _id: { $in: userIds },
          "notification.GeneralNotification": true 
        });
      } else {
        users = await User.find({ "notification.GeneralNotification": true });
      }
      
      if (users.length === 0) {
        return res.status(200).json({
          status: false,
          message: "No users found with General Notification enabled!",
        });
      }

      try {
        const response = await sendFcmMulticast({
          users,
          title: req.body.title,
          body: req.body.description,
          image: req.body.image,
          deepLink: req.body.deepLink,
        });

        // Save notifications to database for all users
        const savePromises = users.map(async (user) => {
          const notificationRecord = new Notification();
          notificationRecord.userId = user._id;
          notificationRecord.title = req.body.title;
          notificationRecord.message = req.body.description;
          notificationRecord.image = req.body.image;
          notificationRecord.deepLink = req.body.deepLink;
          notificationRecord.date = new Date().toLocaleString("en-US", { timeZone: "UTC" });
          await notificationRecord.save();
        });

        await Promise.all(savePromises);

        return res.status(200).json({
          status: true,
          message: "Successfully sent messages!",
          oneSignalResponse: response
        });
      } catch (error) {
        console.log("Error sending FCM notification:", error);
        return res.status(200).json({
          status: false,
          message: "Something went wrong while sending notifications!",
        });
      }
    } else if (req.body.notificationType.trim() === "App Update") {
      let users;
      
      // Check if specific user IDs are provided
      if (req.body.targetUserIds && req.body.targetUserIds.trim()) {
        const userIds = req.body.targetUserIds.split(',').map(id => id.trim()).filter(id => id);
        users = await User.find({ 
          _id: { $in: userIds },
          "notification.AppUpdate": true 
        });
      } else {
        users = await User.find({ "notification.AppUpdate": true });
      }
      
      if (users.length === 0) {
        return res.status(200).json({
          status: false,
          message: "No users found with App Update notification enabled!",
        });
      }

      try {
        const response = await sendFcmMulticast({
          users,
          title: req.body.title,
          body: req.body.description,
          image: req.body.image,
          deepLink: req.body.deepLink,
        });

        // Save notifications to database for all users
        const savePromises = users.map(async (user) => {
          const notificationRecord = new Notification();
          notificationRecord.userId = user._id;
          notificationRecord.title = req.body.title;
          notificationRecord.message = req.body.description;
          notificationRecord.image = req.body.image;
          notificationRecord.deepLink = req.body.deepLink;
          notificationRecord.date = new Date().toLocaleString("en-US", { timeZone: "UTC" });
          await notificationRecord.save();
        });

        await Promise.all(savePromises);

        return res.status(200).json({
          status: true,
          message: "Successfully sent messages!",
          oneSignalResponse: response
        });
      } catch (error) {
        console.log("Error sending FCM notification:", error);
        return res.status(200).json({
          status: false,
          message: "Something went wrong while sending notifications!",
        });
      }
    } else {
      return res.status(200).json({ status: false, message: "please pass the valid notificationType." });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};
