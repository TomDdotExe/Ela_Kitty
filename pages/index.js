import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';

export default function Home() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/map');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const signInWithEmail = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setMessage(error ? error.message : 'Check your email for the login link!');
    setLoading(false);
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) alert(error.message);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 space-y-6">
      <h1 className="text-3xl font-bold text-emerald-600">Welcome to Ela Kitty</h1>
      <div className="space-y-4 w-full max-w-sm">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 border rounded"
        />
        <button
          onClick={signInWithEmail}
          disabled={loading}
          className="w-full bg-emerald-600 text-white py-2 rounded hover:bg-emerald-700"
        >
          {loading ? 'Sending...' : 'Send Magic Link'}
        </button>

        <div className="flex items-center justify-center">
          <span className="text-sm text-gray-500">or</span>
        </div>

        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center bg-white border py-2 rounded hover:bg-gray-100"
        >
          <img src="/google-icon.svg" alt="Google" className="w-5 h-5 mr-2" />
          Continue with Google
        </button>

        {message && <p className="text-sm text-gray-700 mt-2">{message}</p>}
      </div>
    </main>
  );
}
