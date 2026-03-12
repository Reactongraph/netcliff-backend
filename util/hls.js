// AWS
const { AWSConfig } = require("./awsServices");

exports.createUniqueResourceId = (prefix) => {
  return `${prefix}_${Math.floor(
    100000 + Math.random() * 900000
  )}_${Date.now()}`;
};

const createWwprOutput = (nameModifier, width, height, maxBitrate) => {
  return {
    ContainerSettings: {
      Container: "MPD",
    },
    VideoDescription: {
      Width: width,
      Height: height,
      CodecSettings: {
        Codec: "H_264",
        H264Settings: {
          MaxBitrate: maxBitrate,
          RateControlMode: "QVBR",
          SceneChangeDetect: "TRANSITION_DETECTION",
        },
      },
    },
    NameModifier: nameModifier,
  };
};

const createFpOutput = (nameModifier, width, height, maxBitrate) => {
  return {
    ContainerSettings: {
      Container: "M3U8",
      M3u8Settings: {},
    },
    VideoDescription: {
      Width: width,
      Height: height,
      CodecSettings: {
        Codec: "H_264",
        H264Settings: {
          MaxBitrate: maxBitrate,
          RateControlMode: "QVBR",
          SceneChangeDetect: "TRANSITION_DETECTION",
        },
      },
    },
    AudioDescriptions: [
      {
        AudioSourceName: "Audio Selector 1",
        CodecSettings: {
          Codec: "AAC",
          AacSettings: {
            Bitrate: 96000,
            CodingMode: "CODING_MODE_2_0",
            SampleRate: 48000,
          },
        },
      },
    ],
    OutputSettings: {
      HlsSettings: {},
    },
    NameModifier: nameModifier,
  };
};

const createNoDrmOutput = (nameModifier, width, height, maxBitrate) => {
  return {
    NameModifier: nameModifier,
    VideoDescription: {
      Width: width,
      Height: height,
      CodecSettings: {
        Codec: "H_264",
        H264Settings: {
          RateControlMode: "QVBR",
          MaxBitrate: maxBitrate,
          SceneChangeDetect: "ENABLED",
        },
      },
    },
    AudioDescriptions: [
      {
        CodecSettings: {
          Codec: "AAC",
          AacSettings: {
            Bitrate: 96000,
            CodingMode: "CODING_MODE_2_0",
            SampleRate: 48000,
          },
        },
        LanguageCodeControl: "FOLLOW_INPUT",
        AudioTypeControl: "FOLLOW_INPUT",
        AudioSourceName: "Audio Selector 1",
      },
    ],
    ContainerSettings: {
      Container: "M3U8",
    },
  };
};

const transcodeForWwpr = async (
  inputFile,
  outputBucket,
  outputFolder,
  wwprDrmResourceId
) => {
  const mediaConvert = new AWS.MediaConvert({
    endpoint: process.env.mediaconvert_endpoint,
  });
  const wwprSystemIds = [
    "edef8ba9-79d6-4ace-a3c8-27dcd51d21ed", // Widevine
    "9a04f079-9840-4286-ab92-e65be0885f95", // PlayReady
  ];
  const params = {
    Role: process.env.mediaconvert_role_arn,
    Settings: {
      TimecodeConfig: {
        Source: "ZEROBASED",
      },
      OutputGroups: [
        {
          Name: "DASH ISO",
          Outputs: [
            createWwprOutput("_144p", 256, 144, 300000),
            createWwprOutput("_360p", 640, 360, 750000),
            createWwprOutput("_720p", 1280, 720, 3000000),
            createWwprOutput("_1080p", 1920, 1080, 5000000),
            {
              ContainerSettings: {
                Container: "MPD",
              },
              AudioDescriptions: [
                {
                  AudioSourceName: "Audio Selector 1",
                  CodecSettings: {
                    Codec: "AAC",
                    AacSettings: {
                      Bitrate: 96000,
                      CodingMode: "CODING_MODE_2_0",
                      SampleRate: 48000,
                    },
                  },
                },
              ],
              NameModifier: "_a1080p",
            },
          ],
          OutputGroupSettings: {
            Type: "DASH_ISO_GROUP_SETTINGS",
            DashIsoGroupSettings: {
              SegmentLength: 30,
              Destination: `${outputBucket}/${outputFolder}/wwpr`,
              Encryption: {
                SpekeKeyProvider: {
                  ResourceId: wwprDrmResourceId,
                  SystemIds: wwprSystemIds,
                  Url: process.env.drm_key_provider_url,
                },
              },
              FragmentLength: 2,
            },
          },
        },
      ],
      FollowSource: 1,
      Inputs: [
        {
          AudioSelectors: {
            "Audio Selector 1": {
              DefaultSelection: "DEFAULT",
            },
          },
          VideoSelector: {},
          TimecodeSource: "ZEROBASED",
          FileInput: inputFile,
        },
      ],
    },
  };
  try {
    const response = await mediaConvert.createJob(params).promise();
    console.log("Transcoding Job Created Successfully for wwpr:");
  } catch (error) {
    console.error("Error Creating Transcoding Job for wwpr:");
  }
};

const transcodeForFp = async (
  inputFile,
  outputBucket,
  outputFolder,
  fpDrmResourceId
) => {
  const mediaConvert = new AWS.MediaConvert({
    endpoint: process.env.mediaconvert_endpoint,
  });
  const fpSystemIds = ["94ce86fb-07ff-4f43-adb8-93d2fa968ca2"];
  const params = {
    Role: process.env.mediaconvert_role_arn,
    Settings: {
      TimecodeConfig: {
        Source: "ZEROBASED",
      },
      OutputGroups: [
        {
          Name: "Apple HLS",
          Outputs: [
            createFpOutput("_144p", 256, 144, 300000),
            createFpOutput("_360p", 640, 360, 750000),
            createFpOutput("_720p", 1280, 720, 3000000),
            createFpOutput("_1080p", 1920, 1080, 5000000),
          ],
          OutputGroupSettings: {
            Type: "HLS_GROUP_SETTINGS",
            HlsGroupSettings: {
              SegmentLength: 10,
              Destination: `${outputBucket}/${outputFolder}/fp`,
              Encryption: {
                EncryptionMethod: "SAMPLE_AES",
                InitializationVectorInManifest: "INCLUDE",
                SpekeKeyProvider: {
                  ResourceId: fpDrmResourceId,
                  SystemIds: fpSystemIds,
                  Url: process.env.drm_key_provider_url,
                },
                Type: "SPEKE",
              },
              MinSegmentLength: 0,
            },
          },
        },
      ],
      FollowSource: 1,
      Inputs: [
        {
          AudioSelectors: {
            "Audio Selector 1": {
              DefaultSelection: "DEFAULT",
            },
          },
          VideoSelector: {},
          TimecodeSource: "ZEROBASED",
          FileInput: inputFile,
        },
      ],
    },
  };
  try {
    const response = await mediaConvert.createJob(params).promise();
    console.log("Transcoding Job Created Successfully for fp:");
  } catch (error) {
    console.error("Error Creating Transcoding Job for fp:");
  }
};

const transcodeForNoDrm = async (inputFile, outputBucket, outputFolder) => {
  const mediaConvert = new AWS.MediaConvert({
    endpoint: process.env.mediaconvert_endpoint, // Replace with your endpoint
  });

  const params = {
    Role: process.env.mediaconvert_role_arn,
    Settings: {
      Inputs: [
        {
          FileInput: inputFile,
          AudioSelectors: {
            "Audio Selector 1": {
              DefaultSelection: "DEFAULT",
            },
          },
        },
      ],
      OutputGroups: [
        {
          Name: "HLS Group",
          OutputGroupSettings: {
            Type: "HLS_GROUP_SETTINGS",
            HlsGroupSettings: {
              Destination: `${outputBucket}/${outputFolder}/nodrm`,
              SegmentLength: 6,
              MinSegmentLength: 1,
            },
          },
          Outputs: [
            createNoDrmOutput("_144p", 256, 144, 300000),
            createNoDrmOutput("_360p", 640, 360, 750000),
            createNoDrmOutput("_720p", 1280, 720, 3000000),
            createNoDrmOutput("_1080p", 1920, 1080, 5000000),
          ],
        },
      ],
    },
  };

  try {
    const response = await mediaConvert.createJob(params).promise();
    console.log("Transcoding Job Created Successfully for NoDrm:");
  } catch (error) {
    console.error("Error Creating Transcoding Job for NoDrm:");
  }
};

exports.createAndTriggerTranscodingJob = async (
  inputFile,
  outputBucket,
  outputFolder,
  wwprDrmResourceId, // some unique ID
  fpDrmResourceId // some unique ID
) => {
  // await transcodeForWwpr(
  //   inputFile,
  //   outputBucket,
  //   outputFolder,
  //   wwprDrmResourceId
  // );
  // await transcodeForFp(inputFile, outputBucket, outputFolder, fpDrmResourceId);
  await transcodeForNoDrm(inputFile, outputBucket, outputFolder);
};

exports.cloudFrontSignedUrl = async (basePath) => {
  const privateKey = process.env.cloudfront_private_key.replace(/\\n/g, "\n");
  const keyPairId = process.env.cloudfront_keypair_id;

  const policy = JSON.stringify({
    Statement: [
      {
        Resource: `${basePath}*`,
        Condition: {
          DateLessThan: {
            "AWS:EpochTime": Math.floor(Date.now() / 1000) + 60 * 60 * 5, // 1 hour
          },
        },
      },
    ],
  });

  // const signedUrl = getSignedUrl({
  //   url: `${basePath}*`,
  //   keyPairId,
  //   privateKey,
  //   policy,
  // });

  const cloudfrontSigner = new AWS.CloudFront.Signer(keyPairId, privateKey);

  const signedUrl = cloudfrontSigner.getSignedUrl({
    url: `${basePath}*`,
    policy,
  });

  return signedUrl;
};

exports.cloudFrontSignedCookies = async (basePath) => {
  const privateKey = process.env.cloudfront_private_key.replace(/\\n/g, "\n");
  const keyPairId = process.env.cloudfront_keypair_id;

  const policy = JSON.stringify({
    Statement: [
      {
        Resource: `${basePath}*`,
        Condition: {
          DateLessThan: {
            "AWS:EpochTime": Math.floor(Date.now() / 1000) + 60 * 60, // Expires in 1 hour
          },
        },
      },
    ],
  });

  const cloudfrontSigner = new AWS.CloudFront.Signer(keyPairId, privateKey);
  const signedCookies = cloudfrontSigner.getSignedCookie({ policy });
  return signedCookies; // Returns cookies: CloudFront-Policy, CloudFront-Signature, CloudFront-Key-Pair-Id
};
