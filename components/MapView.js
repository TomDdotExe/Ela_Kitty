// components/MapView.js
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
} from 'react-leaflet';
import { useState, useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from '../lib/supabaseClient';

/* ---------- Fix Leaflet default icons ---------- */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl:
    'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
});

/* ---------- Sanctuary icon (no distortion) ---------- */
/* Place your image at /public/icons/sanctuary.png and
   update iconSize to its true width × height */
const sanctuaryIcon = new L.Icon({
  iconUrl: '/icons/sanctuary.png',
  iconSize:   [32, 32],          // <— adjust to real size
  iconAnchor: [16, 32],
  popupAnchor:[0, -28],
});

/* ---------- Tap handler ---------- */
function TapHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) });
  return null;
}

/* ========================================================= */
export default function MapView({
  focusLat = null,
  focusLng = null,
  highlightId = null,
}) {
  /* form state */
  const [clickedLocation, setClickedLocation] = useState(null);
  const [notes,      setNotes]      = useState('');
  const [isInjured,  setIsInjured]  = useState(false);
  const [photoFile,  setPhotoFile]  = useState(null);
  const [visibility, setVisibility] = useState('public');

  /* data-state */
  const [sightings,   setSightings]   = useState([]);
  const [sanctuaries, setSanctuaries] = useState([]);

  /* misc refs */
  const [user,     setUser]  = useState(null);
  const [mapReady, setReady] = useState(false);
  const mapRef   = useRef(null);
  const popupRef = useRef(null);

  /* ---------- initial fetch ---------- */
  useEffect(() => {
    (async () => {
      /* user */
      const { data:{ user:me } } = await supabase.auth.getUser();
      if (me) setUser(me);

      /* stray sightings */
      const { data:s } = await supabase
        .from('sightings')
        .select('*')
        .order('created_at',{ ascending:false });
      if (s) setSightings(s);

      /* approved sanctuaries (centre marker only) */
      const { data:z } = await supabase
        .from('sanctuaries')
        .select('id,name,latitude,longitude,logo_url')
        .eq('approved', true);
      if (z) {
        setSanctuaries(
          z.map(r => ({
            id:   r.id,
            name: r.name,
            lat:  parseFloat(r.latitude),
            lng:  parseFloat(r.longitude),
            logo: r.logo_url,
          }))
        );
      }
    })();
  }, []);

  /* ---------- deep-link centring ---------- */
  useEffect(() => {
    if (!mapReady || focusLat == null || focusLng == null) return;
    mapRef.current.flyTo([focusLat, focusLng], 17, { animate:true });
    setTimeout(() => popupRef.current?.openOn(mapRef.current), 400);
  }, [mapReady, focusLat, focusLng]);

  /* ---------- centre on new pin ---------- */
  useEffect(() => {
    if (!mapReady || !clickedLocation) return;
    mapRef.current.flyTo(
      [clickedLocation.lat, clickedLocation.lng],
      17,
      { animate:true }
    );
  }, [mapReady, clickedLocation]);

  /* ---------- submit new sighting ---------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return alert('Please log in first');

    const { lat, lng } = clickedLocation;
    let photoUrl = null;

    if (photoFile) {
      const fileName = `${Date.now()}-${photoFile.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('sightings')
        .upload(fileName, photoFile);
      if (uploadErr) return alert('Photo upload failed');

      const { data:{ publicUrl } } = supabase.storage
        .from('sightings')
        .getPublicUrl(fileName);
      photoUrl = publicUrl;
    }

    const { data: row, error } = await supabase
      .from('sightings')
      .insert([{
        latitude:  lat.toString(),
        longitude: lng.toString(),
        notes,
        animals:   1,
        behaviour: isInjured ? 'injured' : 'normal',
        photo_url: photoUrl,
        user_id:   user.id,
        visibility,
      }])
      .select()
      .single();

    if (error) return alert(`Save failed: ${error.message}`);
    setSightings(p => [...p, row]);
    resetForm();
  };

  /* ---------- delete sighting ---------- */
  const handleDelete = async (s) => {
    if (!user) return alert('Log in first');
    const reason = window.prompt('Reason for deletion:');
    if (!reason) return;

    await supabase
      .from('deletion_logs')
      .insert([{ sighting_id: s.id, user_id: user.id, reason }]);
    await supabase
      .from('sightings')
      .delete()
      .eq('id', s.id);
    setSightings(p => p.filter(r => r.id !== s.id));
  };

  /* ---------- helpers ---------- */
  const resetForm = () => {
    setClickedLocation(null);
    setNotes('');
    setIsInjured(false);
    setPhotoFile(null);
    setVisibility('public');
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  /* ---------- render ---------- */
  return (
    <div className="relative h-screen w-screen">
      <div className="absolute inset-0 z-[1]">
        <MapContainer
          center={[38.8333, 20.7]}
          zoom={13}
          scrollWheelZoom
          style={{ height:'100%', width:'100%' }}
          whenReady={({ target }) => { mapRef.current = target; setReady(true); }}
        >
          <TileLayer
            attribution="© OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <TapHandler onMapClick={setClickedLocation} />

          {/* sanctuary markers only (no boundary shapes) */}
          {sanctuaries.map(s => (
            <Marker key={s.id} icon={sanctuaryIcon} position={[s.lat, s.lng]}>
              <Popup>
                <div className="text-sm">
                  <strong>{s.name}</strong>
                  {s.logo && (
                    <img
                      src={s.logo}
                      alt={s.name}
                      className="mt-1 h-16 object-cover rounded"
                    />
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* stray sightings */}
          {sightings.map(s => (
            <Marker
              key={s.id}
              position={[parseFloat(s.latitude), parseFloat(s.longitude)]}
            >
              <Popup ref={s.id === highlightId ? popupRef : null}>
                <div className="text-sm space-y-2">
                  {s.photo_url && (
                    <img
                      src={s.photo_url}
                      alt="Sighting"
                      className="rounded max-h-32 w-full object-cover"
                    />
                  )}
                  <p><strong>Notes:</strong> {s.notes || '—'}</p>
                  <p><strong>Condition:</strong> {s.behaviour}</p>
                  <p><strong>Reported:</strong>{' '}
                    {new Date(s.created_at).toLocaleString()}
                  </p>
                  {user && s.user_id === user.id && (
                    <button
                      onClick={() => handleDelete(s)}
                      className="mt-2 w-full bg-red-600 text-white py-1 rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* provisional marker */}
          {clickedLocation && <Marker position={clickedLocation} />}
        </MapContainer>
      </div>

      {/* LOGOUT button */}
      <button
        onClick={logout}
        className="absolute top-4 left-4 z-[100] bg-white text-black px-3 py-1 rounded shadow"
      >
        Log out
      </button>

      {/* USER badge */}
      {user ? (
        <div className="absolute top-4 right-4 z-[100] bg-white text-black text-xs px-3 py-1 rounded shadow">
          Logged in as:<br /><strong>{user.email}</strong>
        </div>
      ) : (
        <div className="absolute top-4 right-4 z-[100] bg-red-200 text-black text-xs px-3 py-1 rounded shadow">
          Not logged in
        </div>
      )}

      {/* REPORT form */}
      {clickedLocation && (
        <form
          onSubmit={handleSubmit}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white p-4 shadow-md rounded-lg w-[90%] max-w-md z-[50]"
        >
          <h2 className="text-lg font-semibold mb-2">Report Stray Sighting</h2>

          <textarea
            rows={3}
            placeholder="Describe what you saw…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          />

          <label className="flex items-center space-x-2 mb-3">
            <input
              type="checkbox"
              checked={isInjured}
              onChange={e => setIsInjured(e.target.checked)}
            />
            <span>Animal appears injured</span>
          </label>

          <label className="block mb-3">
            <span className="text-sm font-medium">Who can view this report?</span>
            <select
              value={visibility}
              onChange={e => setVisibility(e.target.value)}
              className="mt-1 w-full border rounded p-2"
            >
              <option value="public">Public</option>
              <option value="caregiver">Caregivers only</option>
              <option value="admin">Admins only</option>
            </select>
          </label>

          <input
            type="file"
            accept="image/*"
            onChange={e => setPhotoFile(e.target.files[0])}
            className="mb-3"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-emerald-600 text-white py-2 rounded hover:bg-emerald-700"
            >
              Submit
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 bg-gray-300 text-black py-2 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
