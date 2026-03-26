import { Amplify } from 'aws-amplify';

// Check if environment variables are available
const userPoolId = process.env.NEXT_PUBLIC_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID;

if (!userPoolId || !userPoolClientId) {
  console.error('Missing required environment variables for AWS Amplify configuration');
  console.error('NEXT_PUBLIC_USER_POOL_ID:', userPoolId);
  console.error('NEXT_PUBLIC_USER_POOL_CLIENT_ID:', userPoolClientId);
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: userPoolId || 'fallback-pool-id',
      userPoolClientId: userPoolClientId || 'fallback-client-id',
    },
  },
});

export default Amplify;
