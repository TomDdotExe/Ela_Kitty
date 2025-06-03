// components/SanctuaryForm.js
import { useState } from 'react';
import dynamic      from 'next/dynamic';
import { supabase } from '../lib/supabaseClient';
import 'leaflet/dist/leaflet.css';

/* ───── client-side helpers (no SSR) ───── */
const MiniMap        = dynamic(() => import('./MiniMap'),        { ssr: false });
const BoundaryDrawer = dynamic(() => import('./BoundaryDrawer'), { ssr: false });

/* services you offer today (add / rename freely) */
const SERVICES = [
  { key: 'shelter',   label: 'Shelter',    tip: 'Long-term housing' },
  { key: 'tnr',       label: 'TNR',        tip: 'Trap / Neuter / Release' },
  { key: 'vet-care',  label: 'Vet care',   tip: 'On-site or partner vet' },
  { key: 'adoption',  label: 'Adoption',   tip: 'Re-homing programme' },
];

/* weekdays for opening-hours grid */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ────────────────────────────────────────── */
export default function SanctuaryForm({
  sanctuary  = {},          // existing row or {}
  caregivers = [],          // [{ id, email }]
  onSave,                   // (form, caregiverIds) => …
  onClose,                  // () => …
}) {
  /* ---------- initialise form ---------- */
  const [form, setForm] = useState(() => {
    /* build user-friendly opening-hours object */
    const toHoursObj = (raw) => {
      const def = { open: '09:00', close: '17:00', closed: false };
      const out = {};
      DAYS.forEach((d) => {
        const k = d.toLowerCase();
        if (!raw) { out[k] = { ...def }; return; }
        try {
          const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (j[k] === 'closed') { out[k] = { ...def, closed: true }; }
          else if (typeof j[k] === 'string' && j[k].includes('-')) {
            const [o, c] = j[k].split('-');
            out[k] = { open: o, close: c, closed: false };
          } else { out[k] = { ...def }; }
        } catch { out[k] = { ...def }; }
      });
      return out;
    };

    return {
      /* geometry & approval */
      id:          sanctuary.id          ?? null,
      name:        sanctuary.name        ?? '',
      latitude:    sanctuary.latitude    ?? '',
      longitude:   sanctuary.longitude   ?? '',
      radius_km:   sanctuary.radius_km   ?? 5,
      boundary:    sanctuary.boundary    ?? null,
      approved:    sanctuary.approved    ?? false,

      /* contact */
      contact_email: sanctuary.contact_email ?? '',
      contact_phone: sanctuary.contact_phone ?? '',

      /* phase-1 extras */
      donate_url:    sanctuary.donate_url    ?? '',
      website_url:   sanctuary.website_url   ?? '',
      facebook_url:  sanctuary.facebook_url  ?? '',
      instagram_url: sanctuary.instagram_url ?? '',
      twitter_url:   sanctuary.twitter_url   ?? '',
      logo_url:      sanctuary.logo_url      ?? '',
      services:      sanctuary.services      ?? [],
      opening_hours: toHoursObj(sanctuary.opening_hours),
    };
  });

  /* caregiver ids assigned to this sanctuary */
  const [assigned, setAssigned] = useState(
    sanctuary.caregiver_assignments
      ? sanctuary.caregiver_assignments.map((a) => a.caregiver_id)
      : []
  );

  /* ui helpers */
  const [mode, setMode]         = useState(sanctuary.boundary ? 'polygon' : 'radius'); // radius | polygon
  const [address, setAddress]   = useState('');
  const [searching, setSearching] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  /* ---------- tiny setters ---------- */
  const setField = (k) => (e) =>
    setForm({
      ...form,
      [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    });

  const toggleService = (key) =>
    setForm((f) => ({
      ...f,
      services: f.services.includes(key)
        ? f.services.filter((x) => x !== key)
        : [...f.services, key],
    }));

  const toggleCaregiver = (id) =>
    setAssigned((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
    );

  /* ---------- logo upload ---------- */
  const uploadLogo = async (file) => {
    if (!file) return;
    setUploading(true);
    const fname = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from('sanctuary-logos')
      .upload(fname, file);
    if (error) { alert('Upload failed'); setUploading(false); return; }
    const {
      data: { publicUrl },
    } = supabase.storage.from('sanctuary-logos').getPublicUrl(fname);
    setForm((f) => ({ ...f, logo_url: publicUrl }));
    setUploading(false);
  };

  /* ---------- geocode helpers ---------- */
  const geocode = async () => {
    if (!address.trim()) return;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        address
      )}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.length) alert('No result');
      else {
        const { lat, lon } = data[0];
        setForm((f) => ({
          ...f,
          latitude: Number(lat).toFixed(6),
          longitude: Number(lon).toFixed(6),
        }));
      }
    } catch {
      alert('Geocoding failed');
    } finally {
      setSearching(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return alert('Geolocation unsupported');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setForm((f) => ({
          ...f,
          latitude: lat.toFixed(6),
          longitude: lon.toFixed(6),
        }));
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
          const j = await (await fetch(url)).json();
          if (j.display_name) setAddress(j.display_name);
        } catch {}
      },
      () => alert('Unable to fetch location')
    );
  };

  /* ---------- submit ---------- */
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Name required');
    if (!form.latitude || !form.longitude) return alert('Location required');

    if (mode === 'radius') {
      if (!form.radius_km) return alert('Radius required');
      form.boundary = null;
    } else {
      if (!form.boundary) return alert('Draw polygon first');
      form.radius_km = null;
    }

    /* convert opening-hours object → compact JSON */
    const hrs = {};
    DAYS.forEach((d) => {
      const k = d.toLowerCase();
      const h = form.opening_hours[k];
      hrs[k] = h.closed ? 'closed' : `${h.open}-${h.close}`;
    });
    form.opening_hours = hrs;

    onSave(form, assigned);
  };

  /* ─────────────────────────── UI ─────────────────────────── */
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]">
      <form
        onSubmit={handleSubmit}
        className={`bg-white w-[90%] max-w-lg p-6 rounded-lg shadow-lg overflow-auto max-h-[90vh] ${
          drawOpen ? 'overflow-hidden' : ''
        }`}
      >
        <h2 className="text-xl font-semibold mb-4">
          {form.id ? 'Edit Sanctuary' : 'Add Sanctuary'}
        </h2>

        <label className="block mb-4">
  <span className="text-sm">Sanctuary name*</span>
  <input
    type="text"
    required
    value={form.name}
    onChange={setField('name')}
    className="mt-1 p-2 border w-full rounded"
    placeholder="e.g. Lefkas Cat Haven"
  />
</label>

        {/* ───── Address search ───── */}
        <label className="block mb-3">
          <span className="text-sm">Address (search)</span>
          <div className="flex gap-2 mt-1">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Nidri Lefkada Greece"
              className="flex-1 p-2 border rounded"
            />
            <button
              type="button"
              onClick={geocode}
              disabled={searching}
              className="px-3 py-1 bg-emerald-600 text-white rounded"
            >
              {searching ? '…' : 'Search'}
            </button>
            <button
              type="button"
              onClick={useMyLocation}
              title="Use current location"
              className="px-3 py-1 border rounded"
            >
              📍
            </button>
          </div>
        </label>

        {/* Mini-map (radius mode only) */}
        {mode === 'radius' &&
          !drawOpen &&
          form.latitude &&
          form.longitude && (
            <MiniMap
              lat={+form.latitude}
              lng={+form.longitude}
              radiusKm={+form.radius_km}
              onMove={(lat, lng) =>
                setForm({ ...form, latitude: lat, longitude: lng })
              }
            />
          )}

        {/* Lat & Lng */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          {['latitude', 'longitude'].map((k, i) => (
            <label key={k} className="block">
              <span className="text-sm">
                {i ? 'Longitude*' : 'Latitude*'}
              </span>
              <input
                type="number"
                step="any"
                required
                value={form[k]}
                onChange={setField(k)}
                className="mt-1 p-2 border w-full rounded"
              />
            </label>
          ))}
        </div>

        {/* Service-area mode */}
        <fieldset className="mt-4 mb-2">
          <legend className="text-sm font-medium">Service area</legend>
          {['radius', 'polygon'].map((m) => (
            <label key={m} className="mr-4">
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
              />{' '}
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </label>
          ))}
        </fieldset>

        {/* Radius input */}
        {mode === 'radius' && (
          <label className="block mb-3">
            <span className="text-sm">Radius km*</span>
            <input
              type="number"
              step="0.1"
              min="0.1"
              required
              value={form.radius_km}
              onChange={setField('radius_km')}
              className="mt-1 p-2 border w-full rounded"
            />
          </label>
        )}

        {/* Polygon drawer */}
        {mode === 'polygon' && (
          <>
            <button
              type="button"
              onClick={() => setDrawOpen(true)}
              className="text-sm underline text-emerald-700 mb-2"
            >
              {form.boundary ? 'Edit boundary polygon' : 'Draw boundary polygon'}
            </button>
            {form.boundary && (
              <p className="text-xs text-gray-600 mb-2">Polygon attached.</p>
            )}
          </>
        )}

        {/* logo upload */}
        <label className="block mt-4 mb-2">
        {/* make the label text its OWN block element */}
        <span className="block text-sm mb-1">Logo / photo</span>

        {/* file picker now sits on the next line */}
        <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => uploadLogo(e.target.files[0])}
            className="p-2 border rounded w-full"
        />

        {/* preview */}
        {form.logo_url && (
            <img
            src={form.logo_url}
            alt="logo"
            className="mt-2 h-20 object-cover rounded"
            />
        )}
        </label>


        {/* Links & socials */}
        {[
          ['donate_url', 'Donate URL'],
          ['website_url', 'Website'],
          ['facebook_url', 'Facebook URL'],
          ['instagram_url', 'Instagram URL'],
          ['twitter_url', 'Twitter URL'],
        ].map(([k, label]) => (
          <label key={k} className="block mb-3">
            <span className="text-sm">{label}</span>
            <input
              value={form[k]}
              onChange={setField(k)}
              placeholder="https://"
              className="mt-1 p-2 border w-full rounded"
            />
          </label>
        ))}

        {/* Opening hours grid */}
        <fieldset className="border p-2 rounded mb-4">
          <legend className="text-sm px-1">Opening hours</legend>
          <div className="space-y-1">
            {DAYS.map((d) => {
              const k = d.toLowerCase();
              const h = form.opening_hours[k];
              return (
                <div key={d} className="flex items-center gap-2 text-xs">
                  <span className="w-10">{d}</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={h.closed}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          opening_hours: {
                            ...f.opening_hours,
                            [k]: { ...h, closed: !h.closed },
                          },
                        }))
                      }
                    />
                    <span>Closed</span>
                  </label>
                  {!h.closed && (
                    <>
                      <input
                        type="time"
                        value={h.open}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            opening_hours: {
                              ...f.opening_hours,
                              [k]: { ...h, open: e.target.value },
                            },
                          }))
                        }
                        className="border p-0.5 rounded"
                      />
                      <span>-</span>
                      <input
                        type="time"
                        value={h.close}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            opening_hours: {
                              ...f.opening_hours,
                              [k]: { ...h, close: e.target.value },
                            },
                          }))
                        }
                        className="border p-0.5 rounded"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        {/* Services chips */}
        <fieldset className="border p-2 rounded mb-4">
          <legend className="text-sm px-1">Services offered</legend>
          <div className="flex flex-wrap gap-3">
            {SERVICES.map((s) => (
              <label
                key={s.key}
                title={s.tip}
                className={`px-2 py-1 rounded-full text-xs cursor-pointer ${
                  form.services.includes(s.key)
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={form.services.includes(s.key)}
                  onChange={() => toggleService(s.key)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Approved flag */}
        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={form.approved}
            onChange={setField('approved')}
          />
          <span>Approved</span>
        </label>

        {/* Caregiver assignment */}
        <fieldset className="mb-4 border p-2 rounded">
          <legend className="text-sm px-1">Assign caregivers</legend>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {caregivers.map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={assigned.includes(c.id)}
                  onChange={() => toggleCaregiver(c.id)}
                />
                <span>{c.email}</span>
              </label>
            ))}
            {!caregivers.length && (
              <p className="text-xs text-gray-500">No caregivers yet</p>
            )}
          </div>
        </fieldset>

        {/* actions */}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 border rounded"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1 bg-emerald-600 text-white rounded"
          >
            Save
          </button>
        </div>
      </form>

      {/* polygon drawer */}
      {drawOpen && (
        <BoundaryDrawer
          lat={form.latitude || 38.8333}
          lng={form.longitude || 20.7}
          radiusKm={form.radius_km}
          initGeoJSON={form.boundary ? JSON.parse(form.boundary) : null}
          onSave={(gj) => {
            setForm({ ...form, boundary: JSON.stringify(gj) });
            setDrawOpen(false);
          }}
          onCancel={() => setDrawOpen(false)}
        />
      )}
    </div>
  );
}
