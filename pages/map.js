import dynamic from 'next/dynamic';
const MapView = dynamic(() => import('../components/MapView'), { ssr: false });

export default function MapPage() {
  return (
    <>
      <MapView />
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-10 flex justify-between items-center bg-white/90 backdrop-blur px-4 py-3 shadow">
        <h1 className="text-xl font-semibold text-emerald-700">Ela Kitty</h1>
        <button className="text-sm text-emerald-600 underline">Logout</button>
      </div>

      {/* Bottom overlay */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-white/90 backdrop-blur px-4 py-4 shadow-md">
        <p className="text-sm text-gray-700">Tap on the map to report a stray or swipe up to see recent activity.</p>
      </div>
    </>
  );
}
