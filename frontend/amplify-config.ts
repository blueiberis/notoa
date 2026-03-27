import { Amplify } from 'aws-amplify';

// Get environment variables
const userPoolId = process.env.NEXT_PUBLIC_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID;

console.log('Environment variables check:');
console.log('UserPool ID:', userPoolId);
console.log('Client ID:', userPoolClientId);

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
  
  try {
    Amplify.configure(amplifyConfig);
    console.log('✅ Amplify configured successfully with:', amplifyConfig);
  } catch (error) {
    console.error('❌ Failed to configure Amplify:', error);
  }
} else {
  console.error('❌ Missing required environment variables for Amplify configuration');
  console.log('Available variables:', {
    userPoolId: !!userPoolId,
    userPoolClientId: !!userPoolClientId,
  });
}

export default Amplify;
