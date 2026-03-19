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

const uploadToS3 = (filePath, bucketName, key) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, fileContent) => {
      if (err) return reject(err);

      const params = {
        Bucket: bucketName,
        Key: key,
        Body: fileContent,
        ContentType: "text/vtt",
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

  const outputDir = `temp/vtt/`;
  const outputFile = path.join(outputDir, `${file.filename}.vtt`);
  const bucketName = process.env.AWS_BUCKET_NAME;
  let fileName = req.body.keyName;
  fileName = fileName.split(".srt")[0];
  const s3Key = `subtitles/${fileName}.vtt`;

  try {
    let fileToUpload = file.path;
    const outputDir = `temp/vtt/`;
    const outputFile = path.join(outputDir, `${file.filename}.vtt`);

    if (fileExtension === ".srt") {
      // Convert SRT to VTT
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      await convertStrToVtt(file.path, outputFile);
      fileToUpload = outputFile;
    } else if (fileExtension === ".vtt") {
      // VTT file - use as is (copy to temp with .vtt for consistent handling)
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      fs.copyFileSync(file.path, outputFile);
      fileToUpload = outputFile;
    } else {
      return res.status(400).json({ error: "Unsupported format. Only .srt and .vtt files are allowed." });
    }

    // Upload VTT to S3
    await uploadToS3(fileToUpload, bucketName, s3Key);

    const url = generateS3Url(s3Key);

    res.json({ status: true, message: "File uploaded Successfully.", url });
  } catch (err) {
    console.error("Subtitle upload error", err);
    res.status(500).json({ error: "Failed to process subtitle file." });
  } finally {
    try {
      fs.rmSync(file.path, { force: true });
      const outputFile = path.join("temp/vtt/", `${file.filename}.vtt`);
      if (fs.existsSync(outputFile)) fs.rmSync(outputFile, { force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  }
};

module.exports = {
  multerUpload,
  uploadVttSubtitle,
};
