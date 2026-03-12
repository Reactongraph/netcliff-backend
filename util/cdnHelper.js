/**
 * CDN Helper Utility
 * Provides functions for generating and managing CDN URLs
 */

/**
 * Generate CDN URL for a given blob path
 * @param {string} containerName - The container name
 * @param {string} blobPath - The blob path (folderStructure/keyName)
 * @returns {string} The complete CDN URL
 */
const generateCdnUrl = (containerName, blobPath) => {
  const cdnEndpoint = process.env.AZURE_CDN_ENDPOINT;
  if (!cdnEndpoint) {
    console.warn('AZURE_CDN_ENDPOINT not configured, falling back to direct blob URL');
    return `${process.env.AZURE_STORAGE_ACCOUNT_URL}/${containerName}/${blobPath}`;
  }
  
  return `${cdnEndpoint}/${containerName}/${blobPath}`;
};

/**
 * Convert direct blob URL to CDN URL
 * @param {string} blobUrl - The direct blob storage URL
 * @returns {string} The CDN URL
 */
const convertBlobUrlToCdn = (blobUrl) => {
  if (!blobUrl) return blobUrl;
  
  const cdnEndpoint = process.env.AZURE_CDN_ENDPOINT;
  if (!cdnEndpoint) return blobUrl;
  
  // Extract container and blob path from blob URL
  const blobUrlPattern = /https:\/\/[^\/]+\/([^\/]+)\/(.+)/;
  const match = blobUrl.match(blobUrlPattern);
  
  if (match) {
    const [, container, blobPath] = match;
    return `${cdnEndpoint}/${container}/${blobPath}`;
  }
  
  return blobUrl;
};

/**
 * Check if a URL is already a CDN URL
 * @param {string} url - The URL to check
 * @returns {boolean} True if it's a CDN URL
 */
const isCdnUrl = (url) => {
  if (!url) return false;
  return url.includes(process.env.AZURE_CDN_ENDPOINT || 'azurefd.net');
};

/**
 * Get the blob path from a CDN URL
 * @param {string} cdnUrl - The CDN URL
 * @returns {string} The blob path
 */
const getBlobPathFromCdnUrl = (cdnUrl) => {
  if (!cdnUrl) return null;
  
  const cdnUrlPattern = /https:\/\/[^\/]+\/([^\/]+)\/(.+)/;
  const match = cdnUrl.match(cdnUrlPattern);
  
  if (match) {
    const [, container, blobPath] = match;
    return `${container}/${blobPath}`;
  }
  
  return null;
};

module.exports = {
  generateCdnUrl,
  convertBlobUrlToCdn,
  isCdnUrl,
  getBlobPathFromCdnUrl
}; 