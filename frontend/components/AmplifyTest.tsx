'use client';
import { useState, useEffect } from 'react';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

export function AmplifyTest() {
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    const testAmplify = async () => {
      try {
        console.log('🧪 Testing Amplify configuration...');
        
        // Test 1: Try to get current user
        const user = await getCurrentUser();
        setTestResult(`✅ getCurrentUser success: ${JSON.stringify(user, null, 2)}`);
      } catch (error: any) {
        console.error('❌ getCurrentUser failed:', error);
        
        // Test 2: Try to get session
        try {
          const session = await fetchAuthSession();
          setTestResult(`✅ fetchAuthSession success: ${JSON.stringify(session, null, 2)}`);
        } catch (sessionError: any) {
          console.error('❌ fetchAuthSession failed:', sessionError);
          setTestResult(`❌ Both tests failed:\n\ngetCurrentUser: ${error.message}\nfetchAuthSession: ${sessionError.message}`);
        }
      }
    };

    // Wait a bit for Amplify to be configured
    const timer = setTimeout(testAmplify, 500);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <h3 className="text-lg font-semibold text-yellow-800 mb-2">Direct Amplify Test</h3>
      <button
        onClick={() => {
          const testAmplify = async () => {
            try {
              console.log('🧪 Testing Amplify configuration...');
              const user = await getCurrentUser();
              setTestResult(`✅ getCurrentUser success: ${JSON.stringify(user, null, 2)}`);
            } catch (error: any) {
              setTestResult(`❌ Test failed: ${error.message}`);
            }
          };
          testAmplify();
        }}
        className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded"
      >
        Test Amplify Directly
      </button>
      {testResult && (
        <div className="mt-4">
          <pre className="bg-white p-3 rounded text-xs overflow-auto">{testResult}</pre>
        </div>
      )}
    </div>
  );
}
