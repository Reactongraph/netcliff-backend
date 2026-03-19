const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3 } = require("./awsServices");

const upload = multer({
  storage: multerS3({
    s3: S3,
    bucket: process?.env?.AWS_BUCKET_NAME,
    // acl: "public-read",
    contentType: multerS3.AUTO_CONTENT_TYPE,
    cacheControl: 'public, max-age=604800', // 7 days caching
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (request, file, cb) {
      console.log("file in s3multer:     " + file);
      console.log("request in s3multer:  ", request.body);

      const folderStructure = request.body.folderStructure;
      const keyName = request.body.keyName;

      const Key = `${folderStructure}/${keyName}`;
      cb(null, Key);
    },
  }),
}).single("content");

module.exports = upload;
