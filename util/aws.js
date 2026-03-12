const axios = require("axios");
const { S3 } = require("./awsServices");

exports.uploadTmdbImageToS3 = async (
  imageUrl,
  filePath,
  bucketName = process.env.bucketName
) => {
  try {
    // Fetch the image from the URL
    const response = await axios({
      url: imageUrl,
      responseType: "arraybuffer",
    });

    const fileBuffer = Buffer.from(response.data);
    const fileName = imageUrl.split("/")?.pop();
    const contentType = response.headers["content-type"];
    const key = `${filePath}/${fileName}`;

    // Upload to S3
    const uploadParams = {
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      ACL: "public-read",
    };

    const uploadResult = await S3.upload(uploadParams).promise();

    return uploadResult.Location; // Returns the public URL of the uploaded image
  } catch (error) {
    console.error("Error uploading image:", error);
    throw new Error("Image upload failed");
  }
};
