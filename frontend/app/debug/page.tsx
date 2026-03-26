'use client';
import { useState } from 'react';
import { getCurrentUser, fetchAuthSession, signIn } from 'aws-amplify/auth';
import { getEnvVariables } from '@/utils/amplify-check';

export default function Debug() {
  const [result, setResult] = useState<string>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const envVars = getEnvVariables();

  const testConnection = async () => {
    setResult('Testing getCurrentUser...');
    
    try {
      const user = await getCurrentUser();
      setResult(`✅ getCurrentUser success: ${JSON.stringify(user, null, 2)}`);
    } catch (error: any) {
      setResult(`❌ getCurrentUser failed: ${error.message}\n\n${JSON.stringify(error, null, 2)}`);
    }
  };

  const testSession = async () => {
    setResult('Testing fetchAuthSession...');
    
    try {
      const session = await fetchAuthSession();
      setResult(`✅ fetchAuthSession success: ${JSON.stringify(session, null, 2)}`);
    } catch (error: any) {
      setResult(`❌ fetchAuthSession failed: ${error.message}\n\n${JSON.stringify(error, null, 2)}`);
    }
  };

  const testSignIn = async () => {
    setResult('Testing signIn...');
    
    try {
      const signInResult = await signIn({ username: email, password });
      setResult(`✅ signIn success: ${JSON.stringify(signInResult, null, 2)}`);
    } catch (error: any) {
      setResult(`❌ signIn failed: ${error.message}\n\n${JSON.stringify(error, null, 2)}`);
    }
  };

  const testConfig = async () => {
    setResult('Testing Amplify configuration...');
    
    try {
      // Test if we can access the configuration
      const config = {
        userPoolId: envVars.userPoolId,
        userPoolClientId: envVars.userPoolClientId,
        region: envVars.region,
      };
      
      setResult(`✅ Configuration test:\n${JSON.stringify(config, null, 2)}\n\nConfiguration appears to be valid.`);
    } catch (error: any) {
      setResult(`❌ Configuration test failed: ${error.message}`);
    }
  };

  const testBackendAPI = async () => {
    setResult('Testing backend API...');
    
    try {
      const response = await fetch(`${envVars.apiUrl}/notes`);
      const data = await response.json();
      setResult(`✅ Backend API success:\nStatus: ${response.status}\nData: ${JSON.stringify(data, null, 2)}`);
    } catch (error: any) {
      setResult(`❌ Backend API failed: ${error.message}\n\nTrying to fetch from: ${envVars.apiUrl}/notes`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">AWS Amplify Debug</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Environment Variables</h2>
          <div className="space-y-2 font-mono text-sm">
            <p>NEXT_PUBLIC_USER_POOL_ID: {envVars.userPoolId || '❌ Missing'}</p>
            <p>NEXT_PUBLIC_USER_POOL_CLIENT_ID: {envVars.userPoolClientId || '❌ Missing'}</p>
            <p>NEXT_PUBLIC_API_URL: {envVars.apiUrl || '❌ Missing'}</p>
            <p>NEXT_PUBLIC_CLOUDFRONT_URL: {envVars.cloudfrontUrl || '❌ Missing'}</p>
            <p>NEXT_PUBLIC_REGION: {envVars.region || '❌ Missing'}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Connection Tests</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={testConfig}
              className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded"
            >
              Test Config
            </button>
            <button
              onClick={testBackendAPI}
              className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded"
            >
              Test Backend API
            </button>
            <button
              onClick={testConnection}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              Test getCurrentUser
            </button>
            <button
              onClick={testSession}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
            >
              Test fetchAuthSession
            </button>
          </div>
          
          <div className="border-t pt-4">
            <h3 className="text-lg font-medium mb-2">Test Sign In (with test account)</h3>
            <div className="flex flex-col gap-2 mb-4">
              <input
                type="email"
                placeholder="Test email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border px-3 py-2 rounded"
              />
              <input
                type="password"
                placeholder="Test password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border px-3 py-2 rounded"
              />
              <button
                onClick={testSignIn}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded"
              >
                Test Sign In
              </button>
            </div>
          </div>
        </div>

        {result && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Result</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm max-h-96">
              {result}
            </pre>
          </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-6">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">Next Steps</h3>
          <ol className="list-decimal list-inside space-y-2 text-yellow-700">
            <li>Test the configuration first (purple button)</li>
            <li>Try getCurrentUser - this should fail with "Not authenticated" which is expected</li>
            <li>If you have a test account, try the sign in test</li>
            <li>Check browser console for additional error messages</li>
            <li>Make sure CORS is configured properly if you see network errors</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
