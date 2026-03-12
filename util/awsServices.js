const AWS = require('aws-sdk');

// Configure AWS with environment variables
const AWSConfig = AWS.config.update({
    region: process.env.region,
    accessKeyId: process?.env?.aws_access_key_id,
    secretAccessKey: process?.env?.aws_secret_access_key
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