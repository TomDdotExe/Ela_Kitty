// components/MapView.js
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  GeoJSON,
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

/* ---------- Sanctuary custom icon (green paw) 🆕 ---------- */
const sanctuaryIcon = new L.Icon({
  iconUrl:
    'https://raw.githubusercontent.com/tailwindtoolbox/Marketing-Landing-Page/master/src/img/svg/paw-solid.svg', // any small paw svg/png
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -28],
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
  const [clickedLocation, setClickedLocation] = useState(null);
  const [notes, setNotes] = useState('');
  const [isInjured, setIsInjured] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [visibility, setVisibility] = useState('public');

  const [sightings, setSightings] = useState([]);
  const [zones, setZones] = useState([]);           // circles / polygons
  const [sanctuaries, setSanctuaries] = useState([]); // 🆕 marker centres

  const [user, setUser] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  const mapRef = useRef(null);
  const popupRef = useRef(null);

  /* ----- initial fetch ----- */
  useEffect(() => {
    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (currentUser) setUser(currentUser);

      const { data: sData } = await supabase
        .from('sightings')
        .select('*')
        .order('created_at', { ascending: false });
      if (sData) setSightings(sData);

      /* approved sanctuaries with geometry + name & logo 🆕 */
      const { data: zData } = await supabase
        .from('sanctuaries')
        .select(
          'id, name, latitude, longitude, radius_km, boundary, logo_url'
        )
        .eq('approved', true);
      if (zData) {
        setZones(zData);
        setSanctuaries(
          zData.map((z) => ({
            id: z.id,
            name: z.name,
            lat: z.latitude,
            lng: z.longitude,
            logo: z.logo_url,
          }))
        );
      }
    })();
  }, []);

  /* ----- deep-link centring ----- */
  useEffect(() => {
    if (!mapReady || focusLat == null || focusLng == null) return;
    mapRef.current.flyTo([focusLat, focusLng], 17, { animate: true });
    setTimeout(() => {
      if (popupRef.current?.openOn) popupRef.current.openOn(mapRef.current);
    }, 400);
  }, [mapReady, focusLat, focusLng]);

  /* ----- centre on new pin ----- */
  useEffect(() => {
    if (!mapReady || !clickedLocation) return;
    mapRef.current.flyTo(
      [clickedLocation.lat, clickedLocation.lng],
      17,
      { animate: true }
    );
  }, [mapReady, clickedLocation]);

  /* ----- submit new sighting (unchanged) ----- */
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

      const {
        data: { publicUrl },
      } = supabase.storage.from('sightings').getPublicUrl(fileName);
      photoUrl = publicUrl;
    }

    const { data: newRow, error } = await supabase
      .from('sightings')
      .insert([
        {
          latitude: lat.toString(),
          longitude: lng.toString(),
          notes,
          animals: 1,
          behaviour: isInjured ? 'injured' : 'normal',
          photo_url: photoUrl,
          user_id: user.id,
          visibility,
        },
      ])
      .select()
      .single();

    if (error) return alert(`Save failed: ${error.message}`);
    setSightings((p) => [...p, newRow]);
    resetForm();
  };

  /* ----- delete sighting (unchanged) ----- */
  const handleDelete = async (s) => {
    if (!user) return alert('Log in first');
    const reason = window.prompt('Reason for deletion:');
    if (!reason) return;

    await supabase
      .from('deletion_logs')
      .insert([{ sighting_id: s.id, user_id: user.id, reason }]);
    await supabase.from('sightings').delete().eq('id', s.id);
    setSightings((p) => p.filter((row) => row.id !== s.id));
  };

  /* helpers */
  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };
  const resetForm = () => {
    setClickedLocation(null);
    setNotes('');
    setIsInjured(false);
    setPhotoFile(null);
    setVisibility('public');
  };

  /* ---------- render ---------- */
  return (
    <div className="relative h-screen w-screen">
      <div className="absolute inset-0 z-[1]">
        <MapContainer
          center={[38.8333, 20.7]}
          zoom={13}
          whenReady={({ target }) => {
            mapRef.current = target;
            setMapReady(true);
          }}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <TapHandler onMapClick={setClickedLocation} />

          {/* sanctuary zones (circles / polygons) */}
          {zones.map((z) =>
            z.boundary ? (
              <GeoJSON
                key={z.id}
                data={JSON.parse(z.boundary)}
                style={{ color: '#10b981', weight: 2, fillOpacity: 0.1 }}
              />
            ) : (
              <Circle
                key={z.id}
                center={[z.latitude, z.longitude]}
                radius={Number(z.radius_km) * 1000}
                pathOptions={{ color: '#10b981', fillOpacity: 0.1 }}
              />
            )
          )}

          {/* sanctuary markers 🆕 */}
          {sanctuaries.map((s) => (
            <Marker
              key={s.id}
              icon={sanctuaryIcon}
              position={[s.lat, s.lng]}
            >
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

          {/* saved stray sightings */}
          {sightings.map((s) => (
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
                  <p>
                    <strong>Notes:</strong> {s.notes || '—'}
                  </p>
                  <p>
                    <strong>Condition:</strong> {s.behaviour}
                  </p>
                  <p>
                    <strong>Reported:</strong>{' '}
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

      {/* LOGOUT + STATUS */}
      <button
        onClick={logout}
        className="absolute top-4 left-4 z-[100] bg-white text-black px-3 py-1 rounded shadow"
      >
        Log out
      </button>

      {user ? (
        <div className="absolute top-4 right-4 z-[100] bg-white text-black text-xs px-3 py-1 rounded shadow">
          Logged in as:
          <br />
          <strong>{user.email}</strong>
        </div>
      ) : (
        <div className="absolute top-4 right-4 z-[100] bg-red-200 text-black text-xs px-3 py-1 rounded shadow">
          Not logged in
        </div>
      )}

      {/* REPORT FORM (unchanged) */}
      {clickedLocation && (
        <form
          onSubmit={handleSubmit}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white p-4 shadow-md rounded-lg w-[90%] max-w-md z-[50]"
        >
          <h2 className="text-lg font-semibold mb-2">
            Report Stray Sighting
          </h2>

          <textarea
            placeholder="Describe what you saw…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-2 border rounded mb-2"
            rows={3}
          />

          <label className="flex items-center space-x-2 mb-3">
            <input
              type="checkbox"
              checked={isInjured}
              onChange={(e) => setIsInjured(e.target.checked)}
            />
            <span>Animal appears injured</span>
          </label>

          <label className="block mb-3">
            <span className="text-sm font-medium">
              Who can view this report?
            </span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
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
            onChange={(e) => setPhotoFile(e.target.files[0])}
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
