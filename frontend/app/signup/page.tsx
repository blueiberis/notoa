'use client';
import { useState } from 'react';
import { signUp, confirmSignUp } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [step, setStep] = useState<'signup' | 'confirm'>('signup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    
    try {
      const { isSignUpComplete, nextStep } = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email: email,
          },
        },
      });
      
      if (isSignUpComplete) {
        setSuccess('✅ Account created successfully! Redirecting to login...');
        setTimeout(() => router.push('/login'), 2000);
      } else if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        // Show confirmation step for email verification
        setStep('confirm');
        setSuccess('✅ Account created! Please enter the confirmation code sent to your email.');
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    
    try {
      await confirmSignUp({ 
        username: email, 
        confirmationCode: confirmationCode 
      });
      
      setSuccess('✅ Account confirmed! Redirecting to login...');
      setTimeout(() => router.push('/login'), 2000);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'confirm') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-md w-full bg-white shadow-xl rounded-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Confirm Your Account</h1>
            <p className="text-gray-600">Enter the code sent to {email}</p>
          </div>
          
          <form onSubmit={handleConfirmSignUp} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirmation Code
              </label>
              <input
                type="text"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                placeholder="Enter 6-digit code"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={6}
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-blue-300"
            >
              {loading ? 'Confirming...' : 'Confirm Account'}
            </button>
          </form>
          
          {error && (
            <div className="mt-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">
              {error}
            </div>
          )}
          
          {success && (
            <div className="mt-4 p-3 rounded-md bg-green-50 text-green-700 text-sm">
              {success}
            </div>
          )}
          
          <div className="mt-6 text-center">
            <button
              onClick={() => setStep('signup')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              ← Back to signup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-md w-full bg-white shadow-xl rounded-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h1>
          <p className="text-gray-600">Sign up to get started with Notoa</p>
        </div>
        
        <form onSubmit={handleSignUp} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password (min 8 characters)"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              minLength={8}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-blue-300"
          >
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>
        
        {error && (
          <div className="mt-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mt-4 p-3 rounded-md bg-green-50 text-green-700 text-sm">
            {success}
          </div>
        )}
        
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
