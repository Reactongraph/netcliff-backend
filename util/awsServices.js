const AWS = require('aws-sdk');

// Configure AWS with environment variables
const AWSConfig = AWS.config.update({
    region: process.env.AWS_REGION,
    accessKeyId: process?.env?.AWS_ACCESS_KEY_ID,
    secretAccessKey: process?.env?.AWS_SECRET_ACCESS_KEY
});

const SNS = new AWS.SNS();
const S3 = new AWS.S3();
const SES = new AWS.SES({ apiVersion: "2010-12-01" });
const CloudFormation = new AWS.CloudFormation();
const MediaLive = new AWS.MediaLive();

module.exports = {
    AWSConfig,
    SNS,
    S3,
    SES,
    CloudFormation,
    MediaLive
} 