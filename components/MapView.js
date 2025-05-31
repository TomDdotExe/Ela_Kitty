// components/MapView.js

import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { useState, useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from '../lib/supabaseClient'; // ensure this path is correct

// Fix Leaflet’s default marker icon URLs in React:
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
});

// Component to capture map clicks and pass the lat/lng upward
function TapHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

export default function MapView() {
  const [clickedLocation, setClickedLocation] = useState(null); // { lat, lng } or null
  const [notes, setNotes] = useState('');
  const [isInjured, setIsInjured] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [sightings, setSightings] = useState([]); // array of rows from DB
  const [user, setUser] = useState(null);         // currently logged‐in user

  // On mount: fetch current user and all sightings
  useEffect(() => {
    async function initialize() {
      // 1) Get logged-in user
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();
      if (!userError && currentUser) {
        setUser(currentUser);
      }

      // 2) Fetch all sightings, including user_id
      const { data: rows, error: fetchError } = await supabase
        .from('sightings')
        .select(`
          id,
          latitude,
          longitude,
          notes,
          behaviour,
          photo_url,
          created_at,
          user_id
        `)
        .order('created_at', { ascending: false });

      if (!fetchError && rows) {
        setSightings(rows);
      } else if (fetchError) {
        console.error('Error loading sightings:', fetchError.message);
      }
    }

    initialize();
  }, []);

  // Handle new sighting submission (with user_id)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      alert('Please log in to report a sighting.');
      return;
    }
    const { lat, lng } = clickedLocation;
    let photoUrl = null;

    // 1) Upload photo if provided
    if (photoFile) {
      const filename = `${Date.now()}-${photoFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('sightings')
        .upload(filename, photoFile);

      if (uploadError) {
        console.error('Image upload error:', uploadError.message);
        alert('Failed to upload photo');
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from('sightings').getPublicUrl(filename);
      photoUrl = publicUrl;
    }

    // 2) Insert the new sighting, including user_id = user.id
    const { data: newSighting, error: insertError } = await supabase
      .from('sightings')
      .insert([
        {
          latitude: lat.toString(),
          longitude: lng.toString(),
          notes,
          animals: 1,
          behaviour: isInjured ? 'injured' : 'normal',
          photo_url: photoUrl,
          user_id: user.id, // record ownership
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError.message);
      alert(`Failed to save: ${insertError.message}`);
      return;
    }

    // 3) Update local state so the new marker appears immediately
    setSightings((prev) => [...prev, newSighting]);

    // 4) Reset form + pin
    setClickedLocation(null);
    setNotes('');
    setIsInjured(false);
    setPhotoFile(null);
  };

  // Handle deletion: prompt for reason, log it, then delete the row
  const handleDelete = async (sighting) => {
    if (!user) {
      alert('You must be logged in to delete a sighting.');
      return;
    }
    // 1) Prompt for deletion reason
    const reason = window.prompt('Enter a reason for deletion:');
    if (!reason || reason.trim() === '') {
      alert('Deletion cancelled: reason is required.');
      return;
    }

    // 2) Insert into deletion_logs
    const { error: logError } = await supabase
      .from('deletion_logs')
      .insert([
        {
          sighting_id: sighting.id,
          user_id: user.id,
          reason: reason.trim(),
        },
      ]);

    if (logError) {
      console.error('Error logging deletion:', logError.message);
      alert('Failed to log deletion. Aborting.');
      return;
    }

    // 3) Delete the sighting from the DB
    const { error: deleteError } = await supabase
      .from('sightings')
      .delete()
      .eq('id', sighting.id);

    if (deleteError) {
      console.error('Deletion error:', deleteError.message);
      alert('Failed to delete sighting. Try again.');
      return;
    }

    // 4) Remove it from local state so the marker disappears
    setSightings((prev) => prev.filter((s) => s.id !== sighting.id));
  };

  // Log out the user
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  // Cancel pin + reset form
  const handleCancel = () => {
    setClickedLocation(null);
    setNotes('');
    setIsInjured(false);
    setPhotoFile(null);
  };

  return (
    <div className="relative h-screen w-screen">
      {/* ==================== MAP ==================== */}
      <div className="absolute inset-0 z-[1]">
        <MapContainer
          center={[38.8333, 20.7]}
          zoom={13}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <TapHandler onMapClick={setClickedLocation} />

          {/* Render all saved sightings */}
          {sightings.map((sighting) => (
            <Marker
              key={sighting.id}
              position={[
                parseFloat(sighting.latitude),
                parseFloat(sighting.longitude),
              ]}
            >
              <Popup>
                <div className="text-sm space-y-2">
                  {sighting.photo_url && (
                    <img
                      src={sighting.photo_url}
                      alt="Sighting"
                      className="rounded max-h-32 w-full object-cover"
                    />
                  )}
                  <p>
                    <strong>Notes:</strong> {sighting.notes || 'No notes'}
                  </p>
                  <p>
                    <strong>Condition:</strong> {sighting.behaviour}
                  </p>
                  <p>
                    <strong>Reported:</strong>{' '}
                    {new Date(sighting.created_at).toLocaleString()}
                  </p>

                  {/* Only show “Delete” if current user owns this row */}
                  {user && sighting.user_id === user.id && (
                    <button
                      onClick={() => handleDelete(sighting)}
                      className="mt-2 w-full bg-red-600 text-white py-1 rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Temporary marker while placing a new sighting */}
          {clickedLocation && <Marker position={clickedLocation} />}
        </MapContainer>
      </div>

      {/* ==================== LOGOUT BUTTON ==================== */}
      <button
        onClick={handleLogout}
        className="absolute top-4 left-4 z-[100] bg-white text-black px-3 py-1 rounded shadow"
      >
        Log out
      </button>

      {/* ==================== USER STATUS ==================== */}
      {user ? (
        <div className="absolute top-4 right-4 z-[100] bg-white text-black text-xs px-3 py-1 rounded shadow">
          Logged in as:<br />
          <strong>{user.email}</strong>
        </div>
      ) : (
        <div className="absolute top-4 right-4 z-[100] bg-red-200 text-black text-xs px-3 py-1 rounded shadow">
          Not logged in
        </div>
      )}

      {/* ==================== REPORT FORM OVERLAY ==================== */}
      {clickedLocation && (
        <form
          onSubmit={handleSubmit}
          className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-white p-4 shadow-md rounded-lg w-[90%] max-w-md z-[50]"
        >
          <h2 className="text-lg font-semibold mb-2">Report Stray Sighting</h2>
          <textarea
            placeholder="Describe what you saw..."
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
              onClick={handleCancel}
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
