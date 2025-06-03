// pages/map.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { supabase } from '../lib/supabaseClient';

const MapView = dynamic(() => import('../components/MapView'), { ssr: false });

export default function MapPage() {
  const router = useRouter();
  const { lat, lng, id } = router.query;              // ← query-params
  const [loading, setLoading] = useState(true);

  /* ─── auth guard ─── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/');
      } else {
        setLoading(false);
      }
    });
  }, [router]);

  /* ─── logout ─── */
  const logout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) return <p className="p-4">Loading map…</p>;

  return (
    <>
      {/* Map component receives optional focus props */}
      <MapView
        focusLat={lat ? parseFloat(lat) : null}
        focusLng={lng ? parseFloat(lng) : null}
        highlightId={id ?? null}
      />

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-10 flex justify-between items-center bg-white/90 backdrop-blur px-4 py-3 shadow">
        <h1 className="text-xl font-semibold text-emerald-700">Ela Kitty</h1>
        <button onClick={logout} className="text-sm text-emerald-600 underline">
          Logout
        </button>
      </div>

      {/* Bottom overlay */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-white/90 backdrop-blur px-4 py-4 shadow-md">
        <p className="text-sm text-gray-700">
          Tap on the map to report a stray or swipe up to see recent activity.
        </p>
      </div>
    </>
  );
}
