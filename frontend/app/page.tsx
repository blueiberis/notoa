'use client';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const { user, loading, error, envVars } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.push('/dashboard');
      }
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Configuration Error</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="bg-gray-100 rounded p-4 text-left mb-6">
              <h3 className="font-semibold text-sm text-gray-700 mb-2">Environment Variables:</h3>
              <div className="text-xs space-y-1">
                <p>NEXT_PUBLIC_USER_POOL_ID: <span className={envVars.userPoolId ? 'text-green-600 font-mono' : 'text-red-600'}>{envVars.userPoolId || '❌ Missing'}</span></p>
                <p>NEXT_PUBLIC_USER_POOL_CLIENT_ID: <span className={envVars.userPoolClientId ? 'text-green-600 font-mono' : 'text-red-600'}>{envVars.userPoolClientId || '❌ Missing'}</span></p>
                <p>NEXT_PUBLIC_API_URL: <span className={envVars.apiUrl ? 'text-green-600 font-mono' : 'text-red-600'}>{envVars.apiUrl || '❌ Missing'}</span></p>
                <p>NEXT_PUBLIC_CLOUDFRONT_URL: <span className={envVars.cloudfrontUrl ? 'text-green-600 font-mono' : 'text-red-600'}>{envVars.cloudfrontUrl || '❌ Missing'}</span></p>
                <p>NEXT_PUBLIC_REGION: <span className={envVars.region ? 'text-green-600 font-mono' : 'text-red-600'}>{envVars.region || '❌ Missing'}</span></p>
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Please ensure the environment variables are set in your deployment environment.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-gray-900 mb-2">
              Notoa
            </h1>
            <p className="text-lg text-gray-600 mb-8">
              Your personal notes application
            </p>
          </div>

          <div className="bg-white shadow-xl rounded-lg p-8">
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  Welcome to Notoa
                </h2>
                <p className="text-gray-600 mb-6">
                  Sign in to access your personal dashboard or create a new account to get started.
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  href="/login"
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Sign In
                </Link>
                
                <Link
                  href="/signup"
                  className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Create Account
                </Link>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-500">
              Secure note-taking powered by AWS
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
