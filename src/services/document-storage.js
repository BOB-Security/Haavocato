'use strict';

const { BlobServiceClient } = require('@azure/storage-blob');

let cachedClient = null;
let cachedContainerName = null;

function getContainer() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER || 'haavocato-private';
  if (!connectionString) {
    const error = new Error('Private document storage is not configured.');
    error.code = 'STORAGE_NOT_CONFIGURED';
    throw error;
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(containerName)) {
    throw new Error('AZURE_STORAGE_CONTAINER is invalid.');
  }
  if (!cachedClient || cachedContainerName !== containerName) {
    cachedClient = BlobServiceClient.fromConnectionString(connectionString);
    cachedContainerName = containerName;
  }
  return cachedClient.getContainerClient(containerName);
}

async function uploadPrivateDocument(blobName, buffer, checksum) {
  const container = getContainer();
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(blobName);
  await blob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: 'application/octet-stream' },
    metadata: { sha256: checksum, purpose: 'private-legal-document' },
  });
  return { blobName, etag: blob.etag || null };
}

async function downloadPrivateDocument(blobName) {
  const container = getContainer();
  const blob = container.getBlobClient(blobName);
  const response = await blob.download();
  if (!response.readableStreamBody) throw new Error('Private document stream is unavailable.');
  return response.readableStreamBody;
}

async function deletePrivateDocument(blobName) {
  const container = getContainer();
  await container.getBlobClient(blobName).deleteIfExists();
}

module.exports = { uploadPrivateDocument, downloadPrivateDocument, deletePrivateDocument };
