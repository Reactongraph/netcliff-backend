const admin = require("firebase-admin");
const settingsPromise = require("../index");

let firebaseApp;

const initFirebase = async () => {
  if (firebaseApp) return firebaseApp;

  try {
    console.log("Waiting for settings to initialize for Firebase...");
    await settingsPromise;

    if (!global.settingJSON || !global.settingJSON.privateKey || Object.keys(global.settingJSON.privateKey).length === 0) {
      console.error("Firebase Private Key is missing or empty in settings. Firebase features will not work.");
      // We return null or throw depending on how critical Firebase is. 
      // Given the errors, it's better to log and return than to crash the whole startup if possible,
      // but the original code was throwing, so we'll throw a more descriptive error.
      throw new Error("Service account must be an object. Check if privateKey is set in the Settings collection.");
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(global.settingJSON.privateKey),
    });

    console.log("Firebase Admin SDK initialized successfully");
    return firebaseApp;
  } catch (error) {
    console.error("Failed to initialize Firebase Admin SDK:", error.message);
    throw error;
  }
};

module.exports = initFirebase();
