exports.contactUsQueryTemplate = () => {
  const subject = "Contct Request";
  const html = `
    <!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <meta http-equiv='x-ua-compatible' content='ie=edge'>
    <meta name='viewport' content='width=device-width, initial-scale=1'>
</head>
<body style='width: 100%; height: 100%; padding: 0; margin: 0; background-color: #f8f8f8; font-family: Arial, sans-serif;'>
    <table border='0' cellpadding='0' cellspacing='0' width='100%'>
        <tr>
            <td align='center' bgcolor='#f8f8f8' style='padding: 20px;'>
                <table border='0' cellpadding='0' cellspacing='0' width='600px' style='background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); padding: 30px;'>
                    <tr>
                        <td style='padding-bottom: 15px; text-align: left;'>
                            <img src='https://kalingoott.s3.us-east-1.amazonaws.com/master/logo192.png' 
                                 alt='Kalingo Inc.' border='0' width='60' style='display: block;'>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style='font-size: 14px; color: #555; line-height: 22px; text-align: left;'>
                            Dear Admin,
                            <br><br>
                            A user has submitted an inquiry through the <strong>Kalingo Inc.</strong> contact form. Below are the details of the request:
                            <br><br>
                            <strong>Name:</strong> {{NAME}}
                            <br>
                            <strong>Email:</strong> {{EMAIL}}
                            <br>
                            <strong>Phone:</strong> {{PHONE}}
                            <br>
                            <strong>Message:</strong> {{MESSAGE}}
                            <br><br>
                            Please review the inquiry and respond to the user at your earliest convenience.
                            <br><br>
                            Thank you.
                        </td>
                    </tr>
                    <tr>
                        <td style='padding-top: 20px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #ddd;'>
                            &copy; 2025 Kalingo Inc. All rights reserved.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>

`;

  return {
    subject,
    html,
  };
};

exports.contactUsSolveTemplate = () => {
  const subject = "Contct Response";
  const html = `
  <!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <meta http-equiv='x-ua-compatible' content='ie=edge'>
    <meta name='viewport' content='width=device-width, initial-scale=1'>
</head>
<body style='width: 100%; height: 100%; padding: 0; margin: 0; background-color: #f8f8f8; font-family: Arial, sans-serif;'>
    <table border='0' cellpadding='0' cellspacing='0' width='100%'>
        <tr>
            <td align='center' bgcolor='#f8f8f8' style='padding: 20px;'>
                <table border='0' cellpadding='0' cellspacing='0' width='600px' style='background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); padding: 30px;'>
                    <tr>
                        <td style='padding-bottom: 15px; text-align: left;'>
                            <img src='https://kalingoott.s3.us-east-1.amazonaws.com/master/logo192.png' 
                                 alt='Kalingo Inc.' border='0' width='60' style='display: block;'>
                        </td>
                    </tr>
                    <tr>
                        <td style='font-size: 18px; font-weight: bold; color: #333; padding-bottom: 10px; text-align: left;'>
                            Thank You for Contacting Us
                        </td>
                    </tr>
                    <tr>
                        <td style='font-size: 14px; color: #555; line-height: 22px; text-align: left;'>
                            Hello,
                            <br><br>
                            We appreciate you reaching out to <strong>Kalingo Inc.</strong>.
                            <br><br>
                            <em>{{COMMENT}}</em>
                            <br><br>
                            Thank you for your patience and for choosing <strong>Kalingo Inc.</strong>
                        </td>
                    </tr>
                    <tr>
                        <td style='padding-top: 20px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #ddd;'>
                            &copy; 2025 Kalingo Inc. All rights reserved.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

  return {
    subject,
    html,
  };
};

exports.resetPasswordTemplate = () => {
  const subject = `Sending Email from ${process?.env?.appName} for Password Security`;
  const html = `
    <!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <meta http-equiv='x-ua-compatible' content='ie=edge'>
    <meta name='viewport' content='width=device-width, initial-scale=1'>
</head>
<body style='width: 100%; height: 100%; padding: 0; margin: 0; background-color: #f8f8f8; font-family: Arial, sans-serif;'>
    <table border='0' cellpadding='0' cellspacing='0' width='100%'>
        <tr>
            <td align='center' bgcolor='#f8f8f8' style='padding: 20px;'>
                <table border='0' cellpadding='0' cellspacing='0' width='600px' style='background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); padding: 30px;'>
                    <tr>
                        <td style='padding-bottom: 15px; text-align: left;'>
                            <img src='https://kalingoott.s3.us-east-1.amazonaws.com/master/logo192.png' 
                                 alt='Kalingo Inc.' border='0' width='60' style='display: block;'>
                        </td>
                    </tr>
                    <tr>
                        <td style='font-size: 20px; color: #333; font-weight: bold; text-align: left;'>
                            Set Your Password
                        </td>
                    </tr>
                    <tr>
                        <td style='font-size: 14px; color: #555; line-height: 22px; text-align: left; padding-top: 10px;'>
                            Not to worry, we’ve got you covered! Click the button below to set a new password and regain access to your account.
                        </td>
                    </tr>
                    <tr>
                        <td align='center' style='padding: 20px 0;'>
                            <a href='{{RESET_LINK}}' target='_blank' 
                               style='display: inline-block; padding: 12px 24px; font-size: 16px; color: #ffffff; 
                               text-decoration: none; border-radius: 4px; background-color: #FE9A16; 
                               box-shadow: -2px 10px 20px -1px rgba(254, 154, 22, 0.6);'>
                                Set Password
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td style='font-size: 12px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 20px;'>
                            &copy; 2025 Kalingo Inc. All rights reserved.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>

  `;

  return {
    subject,
    html,
  };
};
