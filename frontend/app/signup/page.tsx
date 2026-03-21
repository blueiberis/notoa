'use client';
import { useState } from 'react';
import { Auth } from 'aws-amplify';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(1);

  const signUp = async () => {
    await Auth.signUp({ username: email, password });
    setStep(2);
  };

  const confirmSignUp = async () => {
    await Auth.confirmSignUp(email, code);
    alert('Signup complete! You can login now.');
  };

  return (
    <div className="p-4">
      {step === 1 ? (
        <>
          <input className="border p-2 mb-2" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="border p-2 mb-2" placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <button className="bg-blue-500 text-white px-4 py-2" onClick={signUp}>Sign Up</button>
        </>
      ) : (
        <>
          <input className="border p-2 mb-2" placeholder="Confirmation Code" value={code} onChange={e => setCode(e.target.value)} />
          <button className="bg-green-500 text-white px-4 py-2" onClick={confirmSignUp}>Confirm</button>
        </>
      )}
    </div>
  );
}
