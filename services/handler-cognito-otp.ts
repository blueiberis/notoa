import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({});

export const handler = async (event: any) => {
  const email = event.request.userAttributes.email;
  const code = event.request.code;

  const subject = "Your verification code";
  const message = `YYour OTP is: ${code}`;

  await ses.send(new SendEmailCommand({
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: { Data: subject },
      Body: {
        Text: { Data: message },
      },
    },
    Source: process.env.SES_FROM_ADDRESS!,
  }));

  return event;
};