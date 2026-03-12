const { S3, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const s3Client = new S3({
  forcePathStyle: false,
  endpoint: process?.env?.hostname,
  region: process?.env?.region,
  credentials: {
    accessKeyId: process?.env?.aws_access_key_id,
    secretAccessKey: process?.env?.aws_secret_access_key,
  },
});

const deleteFromSpace = async ({ folderStructure, keyName }) => {
  console.log("folderStructure in deleteFromSpace: ", folderStructure);
  console.log("keyName in deleteFromSpace: ", keyName);

  try {
    const bucketParams = {
      Bucket: process?.env?.bucketName,
      Key: `${folderStructure}/${keyName}`, //parentFolder/childFolder
    };

    console.log("Deleting object: ", bucketParams.Key);

    try {
      const data = await s3Client.send(new DeleteObjectCommand(bucketParams));
      console.log("Successfully deleted object:", bucketParams.Bucket + "/" + bucketParams.Key);
      return data;
    } catch (err) {
      console.log("Error:", err);
    }
  } catch (err) {
    console.log("catch called in deleteFromSpace: ");
    if (err instanceof Error) {
      throw new Error(err.message);
    }
  }
};

module.exports = { deleteFromSpace };
