// components/MiniMap.js
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* default icon fix */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl:
    'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
});

export default function MiniMap({ lat, lng, radiusKm, onMove }) {
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  /* centre whenever coords change */
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 13);
    }
  }, [lat, lng]);

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      whenCreated={(m) => (mapRef.current = m)}
      style={{ height: '200px', width: '100%' }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Marker
        position={[lat, lng]}
        draggable
        eventHandlers={{
          dragend: () => {
            const p = markerRef.current.getLatLng();
            onMove(p.lat.toFixed(6), p.lng.toFixed(6));
          },
        }}
        ref={markerRef}
      />

      <Circle
        center={[lat, lng]}
        radius={radiusKm * 1000}
        pathOptions={{ color: '#10b981', fillOpacity: 0.1 }}
      />
    </MapContainer>
  );
}
