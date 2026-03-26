import { fetchAuthSession } from 'aws-amplify/auth';

export async function isAmplifyConfigured(): Promise<boolean> {
  try {
    // Try to get current session to test configuration
    await fetchAuthSession();
    return true;
  } catch (error: any) {
    console.error('Amplify configuration check failed:', error);
    return false;
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
