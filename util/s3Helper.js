/**
 * S3 Helper Utility
 * Provides functions for generating and managing S3/CDN URLs
 * When S3 is private, use cloudfront_distribution for public access.
 */

const bucketName = process.env.AWS_BUCKET_NAME;
const cloudfrontDistribution = process.env.AWS_CLOUDFRONT_DISTRIBUTION;

/**
 * Generate public URL for an S3 object
 * Uses CloudFront when S3 is private (cloudfront_distribution takes priority)
 * @param {string} key - The S3 object key (e.g. folderStructure/keyName)
 * @returns {string} The complete public URL
 */
const generateS3Url = (key) => {
  const base = cloudfrontDistribution;
  if (base) {
    return `${base.replace(/\/$/, '')}/${key}`;
  }
  // Fallback for public S3 (won't work if bucket is private)
  const region = process.env.AWS_REGION || 'us-east-1';
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
};

/**
 * Extract S3 key from a full URL (S3, CDN, or custom endpoint)
 * @param {string} url - The full URL
 * @returns {string|null} The S3 key or null
 */
const getKeyFromS3Url = (url) => {
  if (!url) return null;

  try {
    // Match: https://host/path or https://host/bucket/path
    const urlPattern = /https?:\/\/[^/]+\/(.+)/;
    const match = url.match(urlPattern);
    if (match) {
      let key = decodeURIComponent(match[1]);
      // Remove bucket name from path if URL format is endpoint/bucket/key
      if (bucketName && key.startsWith(bucketName + '/')) {
        key = key.substring(bucketName.length + 1);
      }
      return key;
    }
  } catch (e) {
    console.error('Error parsing S3 URL:', e?.message);
  }
  return null;
};

module.exports = {
  generateS3Url,
  getKeyFromS3Url,
};
