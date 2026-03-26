import { Amplify } from 'aws-amplify';

// Get environment variables
const userPoolId = process.env.NEXT_PUBLIC_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID;

// Only configure if we have the required environment variables
if (userPoolId && userPoolClientId) {
  const amplifyConfig = {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
      },
    },
  };
  
  Amplify.configure(amplifyConfig);
  console.log('Amplify configured successfully');
} else {
  console.error('Missing required environment variables for Amplify configuration');
  console.log('UserPool ID:', userPoolId);
  console.log('Client ID:', userPoolClientId);
}

export default Amplify;
