// pages/report.js

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { supabase } from '../lib/supabaseClient';

const SightingForm = dynamic(() => import('../components/SightingForm'), { ssr: false });

export default function Report() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/');
      } else {
        setLoading(false);
      }
    });
  }, [router]);

  if (loading) return <p className="p-4">Loading form...</p>;

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold text-emerald-600 mb-4">Report a Stray</h1>
      <SightingForm />
    </main>
  );
}
