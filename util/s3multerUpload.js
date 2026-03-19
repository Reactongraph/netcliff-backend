const multer = require("multer");
const path = require("path");
const { S3 } = require("./awsServices");
const { generateS3Url } = require("./s3Helper");

const bucketName = process.env.AWS_BUCKET_NAME;

const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv',
      'video/webm', 'video/x-matroska',
    ];
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'), false);
    }
  },
}).single("content");

const uploadToS3 = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        status: false,
        message: err.message || "File upload error",
      });
    }

    try {
      if (!req.file) {
        return res.status(400).json({
          status: false,
          message: "Please upload a valid file.",
        });
      }

      if (req.file.mimetype.startsWith('image/') && req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          status: false,
          message: "Image size should be less than 5MB",
        });
      }

      if (!req.body?.folderStructure || !req.body?.keyName) {
        return res.status(400).json({
          status: false,
          message: "Missing folder structure or key name.",
        });
      }

      const fileBuffer = req.file.buffer;
      const contentType = req.file.mimetype;
      const finalKeyName = req.body.keyName;
      const key = `${req.body.folderStructure}/${finalKeyName}`;

      await S3.upload({
        Bucket: bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=604800',
      }).promise();

      req.uploadedFileUrl = generateS3Url(key);
      next();
    } catch (error) {
      console.error('S3 upload error:', error);
      return res.status(500).json({
        status: false,
        message: "Failed to upload file to S3",
      });
    }
  });
};

const LOGIN_THUMBNAIL_FOLDER = 'settings/login-screen';

const uploadLoginThumbnail = multer({
  storage: memoryStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else if (['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm', 'video/x-matroska'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed for login thumbnail.'), false);
    }
  },
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
]);

const uploadLoginThumbnailToS3 = (req, res, next) => {
  uploadLoginThumbnail(req, res, async (err) => {
    if (err) {
      console.error('Login thumbnail multer error:', err);
      return res.status(400).json({
        status: false,
        message: err.message || "File upload error",
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
            message: "Image size should be less than 5MB",
          });
        }
        const fileBuffer = file.buffer;
        const contentType = file.mimetype;
        const finalKeyName = `image-${uuidv4()}${path.extname(file.originalname) || '.jpg'}`;
        const key = `${LOGIN_THUMBNAIL_FOLDER}/${finalKeyName}`;
        await S3.upload({
          Bucket: bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
          CacheControl: 'public, max-age=604800',
        }).promise();
        req.uploadedLoginThumbnailImage = generateS3Url(key);
      }
      if (files.video && files.video[0]) {
        const file = files.video[0];
        const finalKeyName = `video-${uuidv4()}${path.extname(file.originalname) || '.mp4'}`;
        const key = `${LOGIN_THUMBNAIL_FOLDER}/${finalKeyName}`;
        await S3.upload({
          Bucket: bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          CacheControl: 'public, max-age=604800',
        }).promise();
        req.uploadedLoginThumbnailVideo = generateS3Url(key);
      }
      next();
    } catch (error) {
      console.error('Login thumbnail S3 upload error:', error);
      return res.status(500).json({
        status: false,
        message: "Failed to upload login thumbnail file(s) to S3",
      });
    }
  });
};

module.exports = {
  upload,
  uploadToS3,
  uploadLoginThumbnail,
  uploadLoginThumbnailToS3,
};
