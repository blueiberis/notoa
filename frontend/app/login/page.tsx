'use client';
import { useState } from 'react';
import { signIn } from 'aws-amplify/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const user = await signIn({username: email, password});
    alert(`Welcome ${user.nextStep.signInStep}`);
  };

  return (
    <div className="p-4">
      <input className="border p-2 mb-2" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      <input className="border p-2 mb-2" placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button className="bg-blue-500 text-white px-4 py-2" onClick={handleSignIn}>Login</button>
    </div>
  );
}
