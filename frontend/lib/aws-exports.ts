import { Amplify } from "aws-amplify";

Amplify.configure({
  Auth: {
    region: process.env.NEXT_PUBLIC_REGION || "us-east-1",
    userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
    userPoolWebClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
  },
});
