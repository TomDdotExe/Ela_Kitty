// components/SanctuaryForm.js
import { useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

/* Client-side helpers */
const MiniMap        = dynamic(() => import('./MiniMap'),        { ssr:false });
const BoundaryDrawer = dynamic(() => import('./BoundaryDrawer'), { ssr:false });

export default function SanctuaryForm({ sanctuary={}, caregivers=[], onSave, onClose }) {
  /* ---------- form state ---------- */
  const [form, setForm] = useState({
    id:            sanctuary.id            ?? null,
    name:          sanctuary.name          ?? '',
    contact_email: sanctuary.contact_email ?? '',
    contact_phone: sanctuary.contact_phone ?? '',
    latitude:      sanctuary.latitude      ?? '',
    longitude:     sanctuary.longitude     ?? '',
    radius_km:     sanctuary.radius_km     ?? 5,
    boundary:      sanctuary.boundary      ?? null,
    approved:      sanctuary.approved      ?? false,
  });

  /* caregivers */
  const [assigned, setAssigned] = useState(
    sanctuary.caregiver_assignments
      ? sanctuary.caregiver_assignments.map(a=>a.caregiver_id)
      : []
  );

  /* ui helpers */
  const [address,  setAddress ]  = useState('');
  const [searching,setSearching] = useState(false);
  const [drawOpen, setDrawOpen]  = useState(false);

  /* ---------- handlers ---------- */
  const setField = f => e =>
    setForm({ ...form,
      [f]: e.target.type==='checkbox' ? e.target.checked : e.target.value });

  const toggleCaregiver = id =>
    setAssigned(prev => prev.includes(id) ? prev.filter(c=>c!==id) : [...prev,id]);

  const geocode = async () => {
    if (!address.trim()) return;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
      const res = await fetch(url);  const data = await res.json();
      if (!data.length) alert('No result');
      else {
        const { lat, lon } = data[0];
        setForm(f=>({...f, latitude:Number(lat).toFixed(6), longitude:Number(lon).toFixed(6)}));
      }
    } catch { alert('Geocoding failed'); }
    finally { setSearching(false); }
  };

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.name || !form.latitude || !form.longitude)
      return alert('Name and location are required');
    onSave(form, assigned);
  };

  /* ---------- ui ---------- */
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]">
      {/* == base card == */}
      <form
        onSubmit={handleSubmit}
        className={`bg-white w-[90%] max-w-lg p-6 rounded-lg shadow-lg overflow-auto max-h-[90vh] ${
          drawOpen ? 'overflow-hidden' : ''
        }`}
      >
        <h2 className="text-xl font-semibold mb-4">
          {form.id ? 'Edit Sanctuary' : 'Add Sanctuary'}
        </h2>

        {/* address search */}
        <label className="block mb-3">
          <span className="text-sm">Address (search)</span>
          <div className="flex gap-2 mt-1">
            <input
              value={address}
              onChange={e=>setAddress(e.target.value)}
              className="flex-1 p-2 border rounded"
              placeholder="e.g. Nidri Lefkada Greece"
            />
            <button
              type="button"
              onClick={geocode}
              disabled={searching}
              className="px-3 py-1 bg-emerald-600 text-white rounded"
            >
              {searching ? '…' : 'Search'}
            </button>
          </div>
        </label>

        {/* mini-map (only when drawer closed) */}
        {!drawOpen && form.latitude && form.longitude && (
          <MiniMap
            lat={Number(form.latitude)}
            lng={Number(form.longitude)}
            radiusKm={Number(form.radius_km)}
            onMove={(lat,lng)=>setForm({...form, latitude:lat, longitude:lng})}
          />
        )}

        {/* lat / lng / radius */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          {['latitude','longitude','radius_km'].map((f,i)=>(
            <label key={f} className="block">
              <span className="text-sm">
                {['Latitude*','Longitude*','Radius km*'][i]}
              </span>
              <input
                type="number"
                step={f==='radius_km' ? '0.1' : 'any'}
                min={f==='radius_km' ? '0.1' : undefined}
                value={form[f]}
                onChange={setField(f)}
                className="mt-1 p-2 border w-full rounded"
                required
              />
            </label>
          ))}
        </div>

        {/* boundary button */}
        <button
          type="button"
          onClick={()=>setDrawOpen(true)}
          className="text-sm underline text-emerald-700 mt-3"
        >
          {form.boundary ? 'Edit boundary polygon' : 'Draw boundary polygon'}
        </button>
        {form.boundary && (
          <p className="text-xs text-gray-600">Polygon attached.</p>
        )}

        {/* contact info */}
        {['contact_email','contact_phone'].map((f,i)=>(
          <label key={f} className={`block ${i?'mb-4':'mt-3 mb-3'}`}>
            <span className="text-sm">{i? 'Contact phone' : 'Contact email'}</span>
            <input
              type={i? 'text':'email'}
              value={form[f]}
              onChange={setField(f)}
              className="mt-1 p-2 border w-full rounded"
            />
          </label>
        ))}

        {/* approved */}
        <label className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={form.approved} onChange={setField('approved')} />
          <span>Approved</span>
        </label>

        {/* caregiver multiselect */}
        <fieldset className="mb-4 border p-2 rounded">
          <legend className="text-sm px-1">Assign caregivers</legend>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {caregivers.map(c=>(
              <label key={c.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={assigned.includes(c.id)}
                  onChange={()=>toggleCaregiver(c.id)}
                />
                <span>{c.email}</span>
              </label>
            ))}
            {!caregivers.length &&
              <p className="text-xs text-gray-500">No caregivers yet</p>}
          </div>
        </fieldset>

        {/* actions */}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-3 py-1 border rounded">
            Cancel
          </button>
          <button type="submit" className="px-4 py-1 rounded bg-emerald-600 text-white">
            Save
          </button>
        </div>
      </form>

      {/* polygon drawer (overlays everything) */}
      {drawOpen && (
        <BoundaryDrawer
          lat={form.latitude || 38.8333}
          lng={form.longitude || 20.7}
          radiusKm={form.radius_km}
          initGeoJSON={form.boundary ? JSON.parse(form.boundary) : null}
          onSave={gj=>{
            setForm({...form, boundary: JSON.stringify(gj)});
            setDrawOpen(false);
          }}
          onCancel={()=>setDrawOpen(false)}
        />
      )}
    </div>
  );
}
