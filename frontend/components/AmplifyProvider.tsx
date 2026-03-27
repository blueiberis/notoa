'use client';
import { useEffect, useState } from 'react';
import { Amplify } from 'aws-amplify';

interface AmplifyProviderProps {
  children: React.ReactNode;
}

export function AmplifyProvider({ children }: AmplifyProviderProps) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    const configureAmplify = () => {
      try {
        const userPoolId = process.env.NEXT_PUBLIC_USER_POOL_ID;
        const userPoolClientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID;

        console.log('🔧 AmplifyProvider: Configuring Amplify...');
        console.log('Environment variables:', {
          userPoolId: !!userPoolId,
          userPoolClientId: !!userPoolClientId,
        });

        if (userPoolId && userPoolClientId) {
          const config = {
            Auth: {
              Cognito: {
                userPoolId,
                userPoolClientId,
              },
            },
          };

          Amplify.configure(config);
          setIsConfigured(true);
          console.log('✅ AmplifyProvider: Amplify configured successfully');
          
          // Test the configuration
          setTimeout(() => {
            console.log('🧪 AmplifyProvider: Testing configuration...');
          }, 100);
        } else {
          const error = 'Missing required environment variables';
          setConfigError(error);
          console.error('❌ AmplifyProvider:', error);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        setConfigError(errorMsg);
        console.error('❌ AmplifyProvider: Configuration failed:', error);
      }
    };

    configureAmplify();
  }, []);

  if (configError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">Amplify Configuration Error</h2>
          <p className="text-gray-600 mb-4">{configError}</p>
          <div className="text-sm text-gray-500">
            Please check your environment variables and try again.
          </div>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Configuring authentication...</div>
      </div>
    );
  }

  return <>{children}</>;
}
