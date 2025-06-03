// pages/admin.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Link from 'next/link';
import dynamic from 'next/dynamic';

/* Lazy-load sanctuary drawer (avoids SSR leaflet issues) */
const SanctuaryForm = dynamic(
  () => import('../components/SanctuaryForm'),
  { ssr: false }
);

export default function Admin() {
  const router = useRouter();

  /* ───── Global state ───── */
  const [loading, setLoading]   = useState(true);
  const [myRole,  setMyRole]    = useState(null);       // 'admin' | 'caregiver'
  const [tab,     setTab]       = useState('sightings');

  /* Data for each tab */
  const [sightings,   setSightings]   = useState([]);
  const [users,       setUsers]       = useState([]);
  const [sanctuaries, setSanctuaries] = useState([]);
  const [caregivers,  setCaregivers]  = useState([]);

  /* Drawer state (null = closed) */
  const [editSanctuary, setEditSanctuary] = useState(null);

  /* Trigger refetch after any mutation */
  const [refreshKey, setRefreshKey] = useState(0);

  /* ───── Auth / role guard ───── */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/'); return; }

      const { data: me } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (!me || !['admin','caregiver'].includes(me.role)) {
        router.push('/'); return;
      }
      setMyRole(me.role);
      setLoading(false);
    })();
  }, [router]);

  /* ───── Caregiver list (for assignment multiselect) ───── */
  useEffect(() => {
    if (loading) return;
    supabase
      .from('profiles')
      .select('id, email')
      .eq('role', 'caregiver')
      .then(({ data }) => setCaregivers(data || []));
  }, [loading]);

  /* ───── Load data per tab ───── */
  useEffect(() => {
    if (loading) return;

    if (tab === 'sightings') {
      supabase.from('sightings')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data }) => setSightings(data || []));
    }

    if (tab === 'users') {
      supabase.from('profiles')
        .select('id, email, role, created_at')
        .order('created_at', { ascending: false })
        .then(({ data }) => setUsers(data || []));
    }

    if (tab === 'sanctuaries') {
      supabase.from('sanctuaries')
        .select(`
          *,
          caregiver_assignments ( caregiver_id )
        `)
        .order('created_at', { ascending: false })
        .then(({ data }) => setSanctuaries(data || []));
    }
  }, [tab, loading, refreshKey]);

  /* ───── Users tab: role switch ───── */
  const switchRole = async (id, newRole) => {
    if (myRole !== 'admin') return;
    await supabase.from('profiles').update({ role: newRole }).eq('id', id);
    setRefreshKey((k) => k + 1);
  };

  /* ───── Sanctuaries CRUD helpers ───── */
  const saveSanctuary = async (sanctuary, assignedCaregiverIds) => {
    if (myRole !== 'admin') return;

    let sid = sanctuary.id;

    if (sid) {
      /* update */
      await supabase.from('sanctuaries')
        .update(sanctuary)
        .eq('id', sid);

      /* reset caregiver assignments */
      await supabase.from('caregiver_assignments')
        .delete()
        .eq('sanctuary_id', sid);
    } else {
      /* insert new */
      const { data, error } = await supabase
        .from('sanctuaries')
        .insert(sanctuary)
        .select()
        .single();
      if (error) { alert(error.message); return; }
      sid = data.id;
    }

    /* insert caregiver links */
    if (assignedCaregiverIds.length) {
      const rows = assignedCaregiverIds.map(cid => ({
        caregiver_id: cid, sanctuary_id: sid
      }));
      await supabase.from('caregiver_assignments').insert(rows);
    }

    setEditSanctuary(null);
    setRefreshKey(k => k + 1);
  };

  const deleteSanctuary = async (id) => {
    if (myRole !== 'admin') return;
    if (!confirm('Delete this sanctuary?')) return;
    await supabase.from('sanctuaries').delete().eq('id', id);
    setRefreshKey(k => k + 1);
  };

  if (loading) return <p className="p-6">Authorising…</p>;

  /* ───── Render ───── */
  return (
    <div className="min-h-screen flex flex-col">
      {/* header */}
      <header className="flex items-center justify-between px-6 py-3 shadow bg-white">
        <h1 className="text-2xl font-semibold text-emerald-700">
          Ela Kitty dashboard
        </h1>
        <Link href="/" className="text-sm underline text-emerald-600">
          ↩ Back to map
        </Link>
      </header>

      {/* tabs */}
      <nav className="flex gap-6 px-6 mt-4">
        {['sightings','sanctuaries','users'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab===t
              ? 'border-b-2 border-emerald-600 pb-1 font-medium'
              : 'text-gray-500 pb-1'}
          >
            {t[0].toUpperCase()+t.slice(1)}
          </button>
        ))}
      </nav>

      {/* content */}
      <main className="flex-1 p-6 overflow-auto">
        {tab === 'sightings' && (
          <SightingsTable data={sightings} showUser={myRole === 'admin'} />
        )}

        {tab === 'users' && (
          <UsersTable
            data={users}
            canEdit={myRole === 'admin'}
            onSwitch={switchRole}
          />
        )}

        {tab === 'sanctuaries' && (
          <>
            {myRole === 'admin' && (
              <button
                onClick={() => setEditSanctuary({})}
                className="mb-4 px-3 py-1 rounded bg-emerald-600 text-white"
              >
                + Add sanctuary
              </button>
            )}
            <SanctuaryTable
              rows={sanctuaries}
              caregivers={caregivers}
              isAdmin={myRole === 'admin'}
              onEdit={setEditSanctuary}
              onDelete={deleteSanctuary}
            />
          </>
        )}
      </main>

      {/* drawer */}
      {editSanctuary !== null && (
        <SanctuaryForm
          sanctuary={editSanctuary}
          caregivers={caregivers}
          onClose={() => setEditSanctuary(null)}
          onSave={saveSanctuary}
        />
      )}
    </div>
  );
}

/* ───────── Sightings table ───────── */
function SightingsTable({ data, showUser }) {
  if (!data.length) return <p>No reports yet.</p>;

  return (
    <table className="min-w-full text-sm border-separate [border-spacing:0.5rem]">
      <thead>
        <tr className="text-left text-gray-600">
          <th>Date</th><th>Notes</th><th>Visibility</th><th>Injured?</th>
          {showUser && <th>User ID</th>}
        </tr>
      </thead>
      <tbody>
        {data.map(r => (
          <tr key={r.id} className="bg-white shadow-sm rounded">
            <td>{new Date(r.created_at).toLocaleString()}</td>
            <td className="max-w-[250px] break-words">{r.notes || '—'}</td>
            <td>{r.visibility}</td>
            <td>{r.behaviour === 'injured' ? '✅' : ''}</td>
            {showUser && <td className="text-xs">{r.user_id?.slice(0, 8)}…</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ───────── Users table ───────── */
function UsersTable({ data, canEdit, onSwitch }) {
  if (!data.length) return <p>No users found.</p>;
  const roles = ['user', 'caregiver', 'admin'];

  return (
    <table className="min-w-full text-sm border-separate [border-spacing:0.5rem]">
      <thead>
        <tr className="text-left text-gray-600">
          <th>Email</th><th>Role</th><th>Joined</th>{canEdit && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {data.map(u => (
          <tr key={u.id} className="bg-white shadow-sm rounded">
            <td className="pr-4">{u.email}</td>
            <td className="pr-4">{u.role}</td>
            <td>{new Date(u.created_at).toLocaleDateString()}</td>
            {canEdit && (
              <td>
                <select
                  value={u.role}
                  onChange={(e) => onSwitch(u.id, e.target.value)}
                  className="border p-1 rounded"
                >
                  {roles.map(r => <option key={r}>{r}</option>)}
                </select>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ───────── Sanctuaries table ───────── */
function SanctuaryTable({ rows, caregivers, isAdmin, onEdit, onDelete }) {
  if (!rows.length) return <p>No sanctuaries yet.</p>;

  const caregiverEmail = (id) =>
    caregivers.find(c => c.id === id)?.email || '–';

  return (
    <table className="min-w-full text-sm border-separate [border-spacing:0.5rem]">
      <thead>
        <tr className="text-left text-gray-600">
          <th>Name</th><th>Approved</th><th>Location</th><th>Radius km</th><th>Caregivers</th>
          {isAdmin && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(s => (
          <tr key={s.id} className="bg-white shadow-sm rounded">
            <td className="font-medium">{s.name}</td>
            <td>{s.approved ? '✅' : '—'}</td>
            <td>{Number(s.latitude).toFixed(4)}, {Number(s.longitude).toFixed(4)}</td>
            <td>{Number(s.radius_km).toFixed(1)}</td>
            <td>
              {s.caregiver_assignments?.map(a => caregiverEmail(a.caregiver_id)).join(', ')}
            </td>
            {isAdmin && (
              <td className="flex gap-2">
                <button
                  onClick={() => onEdit(s)}
                  className="px-2 py-0.5 border rounded"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(s.id)}
                  className="px-2 py-0.5 border rounded text-red-600"
                >
                  Delete
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
