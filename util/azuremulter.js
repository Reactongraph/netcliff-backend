const multer = require("multer");
const { generateCdnUrl } = require('./cdnHelper');

const { compressToWebP } = require("./imageCompressor");
const path = require("path");
const { containerClient, containerName } = require("./azureServices");

// Custom storage engine for multer
const azureStorage = multer.memoryStorage();

const upload = multer({
  storage: azureStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow image files, video files, and GIFs
    const allowedMimeTypes = [
      // Images
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      // Videos
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-ms-wmv',
      'video/webm',
      'video/x-matroska',
    ];

    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'), false);
    }
  }
}).single("content");

// Middleware to handle Azure upload
const uploadToAzure = (req, res, next) => {
  // First use multer to parse the file
  upload(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        status: false,
        message: err.message || "File upload error"
      });
    }

    try {
      if (!req.file) {
        return res.status(400).json({
          status: false,
          message: "Please upload a valid file."
        });
      }

      // Validation for image size (5MB)
      if (req.file.mimetype.startsWith('image/') && req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          status: false,
          message: "Image size should be less than 5MB"
        });
      }

      if (!req.body?.folderStructure || !req.body?.keyName) {
        return res.status(400).json({
          status: false,
          message: "Missing folder structure or key name."
        });
      }

      let fileBuffer = req.file.buffer;
      let fileSize = req.file.size;
      let contentType = req.file.mimetype;
      let finalKeyName = req.body.keyName;

      // Compress and convert to WebP if it's an image (excluding SVG)
      if (req.file.mimetype.startsWith('image/') && req.file.mimetype !== 'image/svg+xml') {
        try {
          const { buffer: compressedBuffer, info } = await compressToWebP(req.file.buffer);
          fileBuffer = compressedBuffer;
          fileSize = info.size;
          contentType = 'image/webp';

          // Change extension to .webp
          const nameWithoutExt = path.parse(finalKeyName).name;
          finalKeyName = `${nameWithoutExt}.webp`;

          // Update keyName in request body to reflect the new extension
          req.body.keyName = finalKeyName;

          console.log(`Image compressed and converted to WebP: ${req.body.keyName} -> ${finalKeyName}`);
        } catch (compressError) {
          console.error('Error during image compression, uploading original file:', compressError);
          // Fallback to original file if compression fails
        }
      }

      // Generate unique blob name
      const blobName = `${req.body.folderStructure}/${finalKeyName}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Upload to Azure Blob Storage
      await blockBlobClient.upload(fileBuffer, fileSize, {
        blobHTTPHeaders: {
          blobContentType: contentType,
          blobCacheControl: 'public, max-age=604800' // 7 days caching
        }
      });

      // Generate the CDN URL using the helper function
      const cdnUrl = generateCdnUrl(containerName, blobName);

      // Add the URL to the request object
      req.uploadedFileUrl = cdnUrl;

      next();
    } catch (error) {
      console.error('Azure upload error:', error);
      return res.status(500).json({
        status: false,
        message: "Failed to upload file to Azure Blob Storage"
      });
    }
  });
};

// Multer for login screen thumbnail: optional image + video (field names: image, video)
const uploadLoginThumbnail = multer({
  storage: azureStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else if ([
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm', 'video/x-matroska'
    ].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed for login thumbnail.'), false);
    }
  }
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]);

const LOGIN_THUMBNAIL_FOLDER = 'settings/login-screen';

const uploadLoginThumbnailToAzure = (req, res, next) => {
  uploadLoginThumbnail(req, res, async (err) => {
    if (err) {
      console.error('Login thumbnail multer error:', err);
      return res.status(400).json({
        status: false,
        message: err.message || "File upload error"
      });
    }
    try {
      const { v4: uuidv4 } = require('uuid');
      const files = req.files || {};
      if (files.image && files.image[0]) {
        const file = files.image[0];
        if (file.mimetype.startsWith('image/') && file.size > 5 * 1024 * 1024) {
          return res.status(400).json({
            status: false,
            message: "Image size should be less than 5MB"
          });
        }
        let fileBuffer = file.buffer;
        let fileSize = file.size;
        let contentType = file.mimetype;
        let finalKeyName = `image-${uuidv4()}${path.extname(file.originalname) || '.webp'}`;
        if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') {
          try {
            const { buffer: compressedBuffer, info } = await compressToWebP(file.buffer);
            fileBuffer = compressedBuffer;
            fileSize = info.size;
            contentType = 'image/webp';
            finalKeyName = `image-${uuidv4()}.webp`;
          } catch (compressError) {
            console.error('Login thumbnail image compression failed, using original:', compressError?.message);
          }
        }
        const blobName = `${LOGIN_THUMBNAIL_FOLDER}/${finalKeyName}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.upload(fileBuffer, fileSize, {
          blobHTTPHeaders: {
            blobContentType: contentType,
            blobCacheControl: 'public, max-age=604800'
          }
        });
        req.uploadedLoginThumbnailImage = generateCdnUrl(containerName, blobName);
      }
      if (files.video && files.video[0]) {
        const file = files.video[0];
        const finalKeyName = `video-${uuidv4()}${path.extname(file.originalname) || '.mp4'}`;
        const blobName = `${LOGIN_THUMBNAIL_FOLDER}/${finalKeyName}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.upload(file.buffer, file.size, {
          blobHTTPHeaders: {
            blobContentType: file.mimetype,
            blobCacheControl: 'public, max-age=604800'
          }
        });
        req.uploadedLoginThumbnailVideo = generateCdnUrl(containerName, blobName);
      }
      next();
    } catch (error) {
      console.error('Login thumbnail Azure upload error:', error);
      return res.status(500).json({
        status: false,
        message: "Failed to upload login thumbnail file(s) to storage"
      });
    }
  });
};

module.exports = { upload, uploadToAzure, uploadLoginThumbnail, uploadLoginThumbnailToAzure }; 