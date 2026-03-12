const { SES } = require("./awsServices");

exports.sendEmail = async (to, subject, body) => {
  const params = {
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: body,
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: subject,
      },
    },
    Source: process.env.EMAIL,
  };

  try {
    const result = await SES.sendEmail(params).promise();
    console.log("Email sent successfully!", result);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};
