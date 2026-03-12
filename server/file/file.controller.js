const crypto = require('crypto');
const { deleteFromAzure } = require("../../util/deleteFromAzure");
const MuxUpload = require('../models/MuxUpload');
const Episode = require('../episode/episode.model');
const { v4: uuidv4 } = require('uuid');
const { muxClient, muxDrmClient } = require('../../config/mux');
const { S3 } = require('../../util/awsServices');

//upload content to Azure Blob Storage
exports.uploadContent = async (req, res) => {
  try {
    if (!req.body?.folderStructure || !req.body?.keyName) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details." });
    }

    if (!req?.file) {
      return res
        .status(200)
        .json({ status: false, message: "Please upload a valid files." });
    }

    // Use the URL from the Azure upload middleware
    const url = req.uploadedFileUrl;

    return res
      .status(200)
      .json({ status: true, message: "File uploaded Successfully.", url });
  } catch (error) {
    console.log('File upload content error', error?.message);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//delete upload content from digital ocean storage
exports.deleteUploadContent = async (req, res) => {
  try {

    if (!req.body?.folderStructure || !req.body?.keyName) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details." });
    }

    await deleteFromAzure({
      folderStructure: req.body?.folderStructure,
      keyName: req.body?.keyName,
    });

    return res
      .status(200)
      .json({ status: true, message: "File deleted Successfully." });
  } catch (error) {
    console.log('File delete upload content error', error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// S3 signedURL for uploading file
exports.getS3SignedUrl = async (req, res) => {
  const { fileName, fileType, } = req.body;

  const params = {
    Bucket: process.env.bucketName,
    Key: `raw/${fileName}`,
    ContentType: fileType,
    Expires: 60,
  };

  try {
    const signedUrl = await S3.getSignedUrlPromise("putObject", params);
    res.status(200).json({ signedUrl, key: params.Key });
  } catch (error) {
    console.error("Error generating signed URL", error);
    res.status(500).json({ error: "Failed to generate signed URL" });
  }
};

// Mux upload URL generation
exports.getMuxUploadUrl = async (req, res) => {
  try {
    const uploadId = uuidv4();
    const { drm } = req.query;

    // Choose the appropriate client based on DRM requirement
    const client = drm === 'true' ? muxDrmClient : muxClient;

    let uploadSettings;

    if (drm === 'true') {
      // DRM-enabled upload settings
      uploadSettings = {
        new_asset_settings: {
          // playback_policy: ['signed'],
          video_quality: 'plus',
          passthrough: uploadId,
          advanced_playback_policies: [
            {
              policy: 'drm',
              drm_configuration_id: process.env.MUX_DRM_CONFIGURATION_ID
            }
          ]
        },
        cors_origin: '*',
        webhook_events: ['video.asset.created', 'video.asset.ready']
      };
    } else {
      // Standard upload settings (existing behavior)
      uploadSettings = {
        new_asset_settings: {
          playback_policy: ['signed'],
          video_quality: 'basic',
          passthrough: uploadId
        },
        cors_origin: '*',
        webhook_events: ['video.asset.created', 'video.asset.ready']
      };
    }

    const upload = await client.video.uploads.create(uploadSettings);

    // Create initial upload record
    await MuxUpload.create({
      uploadId,
      status: 'pending',
      drmEnabled: drm === 'true'
    });

    res.status(200).json({
      status: true,
      uploadUrl: upload.url,
      uploadId,
      drmEnabled: drm === 'true'
    });

  } catch (error) {
    console.error('Error creating Mux upload:', error, JSON.stringify(error));
    res.status(500).json({
      status: false,
      error: 'Failed to create upload URL'
    });
  }
};

// Mux asset status check with signed URL generation
// exports.getMuxAssetStatus = async (req, res) => {
//   try {
//     const { uploadId } = req.params;
//     const asset = await muxClient.video.assets.get(uploadId);

//     if (asset.status === 'ready') {
//       // Generate signed playback URL
//       const playbackId = asset.playback_ids[0]?.id;
//       const token = await muxClient.jwt.signPlaybackId(playbackId, {
//         keyId: process.env.MUX_SIGNING_KEY_ID,
//         keySecret: process.env.MUX_SIGNING_KEY_SECRET,
//         expiration: '7d', // Token valid for 7 days
//         type: 'video'
//       });

//       const signedUrl = `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;

//       res.status(200).json({
//         status: asset.status,
//         playbackId: playbackId,
//         hlsUrl: signedUrl
//       });
//     } else {
//       res.status(200).json({
//         status: asset.status,
//         playbackId: asset.playback_ids[0]?.id
//       });
//     }
//   } catch (error) {
//     console.error("Error getting asset status:", error);
//     res.status(500).json({ 
//       error: "Failed to get asset status",
//       details: error.message 
//     });
//   }
// };

// Verify Mux webhook signature
const verifyWebhookSignature = async (req) => {
  const signature = req.headers['mux-signature'];
  if (!signature) return false;

  const timestamp = signature.split(',')[0].split('=')[1];
  const signatureHash = signature.split(',')[1].split('=')[1];

  const payload = `${timestamp}.${JSON.stringify(req.body)}`;

  // Get the upload record to determine if DRM was enabled
  const uploadId = req.body.data?.passthrough;
  let webhookSecret;

  if (uploadId) {
    try {
      const uploadRecord = await MuxUpload.findOne({ uploadId });
      // Use DRM webhook secret if DRM was enabled, otherwise use regular webhook secret
      webhookSecret = uploadRecord?.drmEnabled ? process.env.MUX_DRM_WEBHOOK_SECRET : process.env.MUX_WEBHOOK_SECRET;
    } catch (error) {
      console.error('Error finding upload record for webhook verification:', error);
      // Fallback to regular webhook secret
      webhookSecret = process.env.MUX_WEBHOOK_SECRET;
    }
  } else {
    // Fallback to regular webhook secret if no uploadId found
    webhookSecret = process.env.MUX_WEBHOOK_SECRET;
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signatureHash),
    Buffer.from(expectedSignature)
  );
};

// Handle Mux webhooks
exports.handleWebhook = async (req, res) => {
  try {
    if (!await verifyWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, data } = req.body;
    const uploadId = data.passthrough;

    switch (type) {
      case 'video.asset.ready': {
        const playbackId = data.playback_ids[0].id;
        const duration = data.duration; // Duration in seconds from Mux

        // First try to find and update an existing episode
        const episode = await Episode.findOneAndUpdate(
          { hlsFileName: uploadId }, // If episode was created first
          {
            hlsFileName: playbackId,
            runtime: duration ? duration : 0
          },
          { new: true }
        );

        if (!episode) {
          // If episode doesn't exist, store in temporary collection
          await MuxUpload.findOneAndUpdate(
            { uploadId },
            {
              playbackId,
              status: 'ready',
              duration: duration
            },
            { upsert: true }
          );
        }
        break;
      }

      case 'video.asset.errored': {
        await MuxUpload.findOneAndUpdate(
          { uploadId },
          {
            status: 'error',
            error: data.errors?.[0]?.message || 'Unknown error'
          },
          { upsert: true }
        );
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Helper function to generate signed URL
// const generateSignedUrl = async (playbackId) => {
//   // Your existing signed URL generation logic here
//   // This should match the logic in your hls-signed-url endpoint
//   return `https://stream.mux.com/${playbackId}.m3u8?token=YOUR_SIGNED_TOKEN`;
// }; 