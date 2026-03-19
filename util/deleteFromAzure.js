const { getBlobPathFromCdnUrl } = require('./cdnHelper');
const { containerClient, containerName } = require("./azureServices");

const deleteFromAzure = async ({ folderStructure, keyName, cdnUrl }) => {
  try {

    let blobName;

    // If CDN URL is provided, extract blob path from it
    if (cdnUrl) {
      blobName = getBlobPathFromCdnUrl(cdnUrl);
      if (!blobName) {
        throw new Error('Invalid CDN URL format');
      }
      // Strip container name prefix - blob path should be relative to container
      if (blobName.startsWith(containerName + '/')) {
        blobName = blobName.substring(containerName.length + 1);
      } else if (blobName === containerName) {
        blobName = '';
      }
    } else {
      // Construct blobName from folderStructure and keyName
      let cleanFolder = folderStructure || "";

      // If folderStructure starts with the container name followed by a slash, remove it
      // as the container name is already part of the base URL in the containerClient
      if (cleanFolder.startsWith(containerName + '/')) {  //Like if its starign wiht alright, then two alright give no exist error due to wrong url
        cleanFolder = cleanFolder.substring(containerName.length + 1);
      } else if (cleanFolder === containerName) {
        cleanFolder = "";
      }

      // Remove any leading or trailing slashes from cleanFolder
      cleanFolder = cleanFolder.replace(/^\/+|\/+$/g, '');

      blobName = cleanFolder ? `${cleanFolder}/${keyName}` : keyName;
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Check if blob exists before deleting
    const exists = await blockBlobClient.exists();
    if (exists) {
      await blockBlobClient.delete();
      console.log(`Blob ${blobName} deleted successfully`);
      return true;
    } else {
      console.log(`Blob ${blobName} does not exist`);
      return false;
    }
  } catch (error) {
    console.error('Error deleting from Azure:', error?.message);
    return false;
  }
};

module.exports = { deleteFromAzure }; 