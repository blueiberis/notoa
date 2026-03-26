'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import { isAmplifyConfigured, getEnvVariables, testCognitoConnection } from '@/utils/amplify-check';

interface User {
  username: string;
  userId: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signOutUser: () => Promise<void>;
  envVars: ReturnType<typeof getEnvVariables>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [envVars] = useState(getEnvVariables());

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // First check if environment variables are available
      if (!envVars.userPoolId || !envVars.userPoolClientId) {
        setError('Missing required environment variables for AWS Amplify configuration.');
        setLoading(false);
        return;
      }

      // Test Cognito connection
      const cognitoTest = await testCognitoConnection();
      if (!cognitoTest.success) {
        setError(`Cognito configuration error: ${cognitoTest.error}`);
        setLoading(false);
        return;
      }

      const currentUser = await getCurrentUser();
      if (currentUser) {
        setUser({
          username: currentUser.username,
          userId: currentUser.userId,
        });
      }
    } catch (error: any) {
      // User is not authenticated or other error
      setUser(null);
      if (error.message?.includes('not configured') || error.message?.includes('UserPool')) {
        setError(`AWS Amplify configuration error: ${error.message}`);
      } else if (error.message?.includes('Network error') || error.message?.includes('Failed to fetch')) {
        setError('Network error. Please check your internet connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const signOutUser = async () => {
    await signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signOutUser, envVars }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
