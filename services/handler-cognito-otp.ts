import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({ region: process.env.AWS_REGION });

export const handler = async (event: any) => {
  const email = event.request.userAttributes.email;
  const code = event.request.codeParameter;
  let subject = "";
  let htmlBody = "";

  switch (event.triggerSource) {
    case "CustomMessage_SignUp":
      subject = "Welcome! Confirm your email";
      htmlBody = `
        <html>
        <body style="font-family: Arial, sans-serif; text-align:center;">
          <h2>Welcome to Our App!</h2>
          <p>Your signup code is:</p>
          <h1 style="color:#4a90e2;">${code}</h1>
          <p>Enter this code to verify your email.</p>
        </body>
        </html>
      `;
      break;

    case "CustomMessage_ForgotPassword":
      subject = "Reset your password";
      htmlBody = `
        <html>
        <body style="font-family: Arial, sans-serif; text-align:center;">
          <h2>Password Reset Requested</h2>
          <p>Use the following code to reset your password:</p>
          <h1 style="color:#e24a4a;">${code}</h1>
          <p>This code expires in 10 minutes.</p>
        </body>
        </html>
      `;
      break;

    case "CustomMessage_AdminCreateUser":
      subject = "Your account has been created";
      htmlBody = `
        <html>
        <body style="font-family: Arial, sans-serif; text-align:center;">
          <h2>Your account is ready!</h2>
          <p>An administrator created your account.</p>
          <p>Use this temporary code to set your password:</p>
          <h1 style="color:#4a90e2;">${code}</h1>
        </body>
        </html>
      `;
      break;

    default:
      // Fallback for other triggers
      subject = "Your verification code";
      htmlBody = `
        <html>
        <body style="font-family: Arial, sans-serif; text-align:center;">
          <h2>Your OTP</h2>
          <p>Code:</p>
          <h1 style="color:#4a90e2;">${code}</h1>
        </body>
        </html>
      `;
      break;
  }

  await ses.send(
    new SendEmailCommand({
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: htmlBody } },
      },
      Source: process.env.SES_FROM_ADDRESS!,
    })
  );

  return event;
};
