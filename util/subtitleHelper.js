const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { S3 } = require("../util/awsServices");

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
  const bucketName = process.env.bucketName;
  let fileName = req.body.keyName;
  fileName = fileName.split(".srt")[0];
  const s3Key = `subtitles/${fileName}.vtt`;

  try {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Convert STR to VTT
    await convertStrToVtt(file.path, outputFile);

    // Upload VTT to S3
    await uploadToS3(outputFile, bucketName, s3Key);

    const url = `${process?.env?.endpoint}/${s3Key}`;

    res.json({ status: true, message: "File uploaded Successfully.", url });
  } catch (err) {
    console.error("Conversion error", err);
    res.status(500).json({ error: "Failed to process subtitle file." });
  } finally {
    fs.rmSync(file.path, { force: true });
    fs.rmSync(outputFile, { force: true });
  }
};

module.exports = {
  multerUpload,
  uploadVttSubtitle,
};
