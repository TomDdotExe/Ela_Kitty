// components/BoundaryDrawer.js
import { MapContainer, TileLayer, FeatureGroup, GeoJSON } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

export default function BoundaryDrawer({ lat, lng, initGeoJSON, onSave, onCancel }) {

  /* converts draw layer to GeoJSON and hands it back */
  const _save = (e) => {
    const layer = e.layers.getLayers()[0] || e.layer; // created or edited
    const gj = layer.toGeoJSON();
    onSave(gj);  // parent will stringify before saving
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[300]">
      <div className="bg-white w-[90%] max-w-3xl h-[600px] p-2 rounded shadow-lg flex flex-col">
        <MapContainer
          center={[lat, lng]}
          zoom={13}
          style={{ flex:1 }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FeatureGroup>
            {initGeoJSON && (
              <GeoJSON data={initGeoJSON}/>
            )}

            <EditControl
              position="topright"
              draw={{ polyline:false, rectangle:false, circle:false, marker:false, circlemarker:false }}
              edit={{ edit: true, remove: true }}
              onCreated={_save}
              onEdited={_save}
            />
          </FeatureGroup>
        </MapContainer>

        <button
          onClick={onCancel}
          className="mt-2 self-end px-3 py-1 border rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
