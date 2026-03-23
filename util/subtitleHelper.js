const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { S3 } = require("../util/awsServices");
const { generateS3Url } = require("../util/s3Helper");

const multerUpload = multer({ dest: "temp/srt/" });

const convertStrToVtt = (inputFile, outputFile) => {
  return new Promise((resolve, reject) => {
    fs.readFile(inputFile, "utf8", (err, data) => {
      if (err) return reject(err);

      let vttContent = "WEBVTT\n\n";
      let lines = data.split(/\r?\n/);
      let subtitleIndex = 1;

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        if (line.match(/^\d+$/)) continue;

        let timeMatch = line.match(
          /(\d{2}:\d{2}:\d{2})[:,](\d{2,3}) --> (\d{2}:\d{2}:\d{2})[:,](\d{2,3})/
        );

        if (timeMatch) {
          let startTime = timeMatch[1] + "." + timeMatch[2].padEnd(3, "0");
          let endTime = timeMatch[3] + "." + timeMatch[4].padEnd(3, "0");

          vttContent += `${subtitleIndex}\n${startTime} --> ${endTime}\n`;
          subtitleIndex++;
        } else {
          vttContent += line + "\n";
        }

        if (line === "") vttContent += "\n";
      }

      fs.writeFile(outputFile, vttContent, "utf8", (err) => {
        if (err) return reject(err);
        resolve(outputFile);
      });
    });
  });
};

const uploadToS3 = (filePath, bucketName, key, contentType = "text/vtt") => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, fileContent) => {
      if (err) return reject(err);

      const params = {
        Bucket: bucketName,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
      };

      S3.upload(params, (err, data) => {
        if (err) return reject(err);
        resolve(data.Location);
      });
    });
  });
};

const uploadVttSubtitle = async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded." });

  const bucketName = process.env.AWS_BUCKET_NAME;
  const originalKeyName = req.body.keyName || file.originalname;
  const fileExtension = path.extname(originalKeyName).toLowerCase();
  const baseFileName = path.basename(originalKeyName, fileExtension);
  const s3Key = `subtitles/${baseFileName}${fileExtension}`;


  try {
    let contentType;
    if (fileExtension === ".srt") {
      contentType = "application/x-subrip";
    } else if (fileExtension === ".vtt") {
      contentType = "text/vtt";
    } else {
      return res.status(400).json({ error: "Unsupported format. Only .srt and .vtt files are allowed." });
    }

    // Upload to S3 with original extension and correct content type
    await uploadToS3(file.path, bucketName, s3Key, contentType);

    const url = generateS3Url(s3Key);

    res.json({ status: true, message: "File uploaded Successfully.", url });
  } catch (err) {
    console.error("Subtitle upload error", err);
    res.status(500).json({ error: "Failed to process subtitle file." });
  } finally {
    try {
      fs.rmSync(file.path, { force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  }
};

module.exports = {
  multerUpload,
  uploadVttSubtitle,
};
