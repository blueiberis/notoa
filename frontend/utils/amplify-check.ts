import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

export async function isAmplifyConfigured(): Promise<boolean> {
  try {
    // Try to get current session to test configuration
    await fetchAuthSession();
    return true;
  } catch (error: any) {
    console.error('Amplify configuration check failed:', error);
    // If the error is about not being authenticated, that's actually good - it means the config works
    if (error.message?.includes('not authenticated') || error.message?.includes('No current user')) {
      return true; // Configuration is working, just no user logged in
    }
    return false;
  }
}

export async function testCognitoConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    // Try getCurrentUser which is more likely to work if UserPool is configured
    await getCurrentUser();
    return { success: true };
  } catch (error: any) {
    console.error('Cognito connection test failed:', error);
    // If the error is about not being authenticated, that's actually good
    if (error.message?.includes('not authenticated') || error.message?.includes('No current user')) {
      return { success: true };
    }
    return { 
      success: false, 
      error: error.message || 'Unknown Cognito error' 
    };
  }
}

export function getEnvVariables() {
  return {
    userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID,
    userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID,
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    cloudfrontUrl: process.env.NEXT_PUBLIC_CLOUDFRONT_URL,
    region: process.env.NEXT_PUBLIC_REGION,
  };
}
