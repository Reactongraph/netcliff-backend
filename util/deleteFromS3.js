const { S3 } = require("./awsServices");
const { getKeyFromS3Url } = require("./s3Helper");

const bucketName = process.env.AWS_BUCKET_NAME;

/**
 * Delete an object from S3
 * @param {Object} params
 * @param {string} [params.folderStructure] - Folder path (e.g. "movieVideo", "subtitles")
 * @param {string} [params.keyName] - File name
 * @param {string} [params.s3Url] - Full S3/CDN URL (extracts key from URL)
 */
const deleteFromS3 = async ({ folderStructure, keyName, s3Url }) => {
  try {
    let key;

    if (s3Url) {
      key = getKeyFromS3Url(s3Url);
      if (!key) {
        console.warn('Could not extract key from S3 URL:', s3Url);
        return false;
      }
    } else if (folderStructure && keyName) {
      let cleanFolder = (folderStructure || "").replace(/^\/+|\/+$/g, '');
      key = cleanFolder ? `${cleanFolder}/${keyName}` : keyName;
    } else {
      console.warn('deleteFromS3: provide folderStructure+keyName or s3Url');
      return false;
    }

    await S3.deleteObject({
      Bucket: bucketName,
      Key: key,
    }).promise();

    console.log(`S3 object deleted: ${key}`);
    return true;
  } catch (error) {
    console.error('Error deleting from S3:', error?.message);
    return false;
  }
};

module.exports = { deleteFromS3 };
