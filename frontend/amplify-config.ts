import { Amplify } from 'aws-amplify';

// Get environment variables at module load time
const userPoolId = process.env.NEXT_PUBLIC_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID;

console.log('🔧 Amplify Config Module Loading...');
console.log('Environment available:', {
  userPoolId: !!userPoolId,
  userPoolClientId: !!userPoolClientId,
  isClient: typeof window !== 'undefined',
});

// Configure immediately if variables are available
if (userPoolId && userPoolClientId) {
  const config = {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
      },
    },
  };
  
  console.log('⚙️ Applying Amplify config:', JSON.stringify(config, null, 2));
  
  try {
    Amplify.configure(config);
    console.log('✅ Amplify configuration applied successfully');
    
    // Global verification
    if (typeof window !== 'undefined') {
      (window as any).__AMPLIFY_CONFIG__ = config;
      console.log('🌐 Amplify config stored in window');
    }
  } catch (error) {
    console.error('❌ Amplify configuration failed:', error);
  }
} else {
  console.error('❌ Missing environment variables');
}

// Export a helper to verify configuration
export function verifyAmplifyConfig() {
  return {
    hasUserPoolId: !!userPoolId,
    hasUserPoolClientId: !!userPoolClientId,
    userPoolId: userPoolId?.substring(0, 10) + '...' || null,
    userPoolClientId: userPoolClientId?.substring(0, 10) + '...' || null,
  };
}

export default Amplify;
