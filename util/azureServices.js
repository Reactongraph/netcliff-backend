const { BlobServiceClient } = require("@azure/storage-blob");

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'alright';

if (!connectionString) {
    console.warn("AZURE_STORAGE_CONNECTION_STRING is not defined in environment variables.");
}

const blobServiceClient = connectionString ? BlobServiceClient.fromConnectionString(connectionString) : null;
const containerClient = blobServiceClient ? blobServiceClient.getContainerClient(containerName) : null;

module.exports = {
    blobServiceClient,
    containerClient,
    containerName
};
