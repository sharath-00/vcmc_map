import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import * as XLSX from 'xlsx';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const createCustomIcon = (type, status) => {
  const isComm = status && !status.toUpperCase().includes('NOT');
  let className = 'custom-marker ';
  
  if (type === 'ilm') className += 'shape-circle ';
  else if (type === 'ccms') className += 'shape-square ';
  else className += 'shape-hub ';

  if (isComm) className += 'status-comm';
  else className += 'status-not-comm';

  return L.divIcon({
    className: className,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
};

function App() {
  const [data, setData] = useState(null); // null means no data uploaded yet
  const [loading, setLoading] = useState(false);

  const [filterType, setFilterType] = useState('All');
  const [filterZone, setFilterZone] = useState('All');
  const [filterWard, setFilterWard] = useState('All');

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setLoading(true);
    let allData = [];
    let processed = 0;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target.result;
        
        if (typeof bstr === 'string' && bstr.includes('<html')) {
          // Handle messy HTML tables masked as .xls
          const parser = new DOMParser();
          const doc = parser.parseFromString(bstr, 'text/html');
          const rows = doc.querySelectorAll('tr');
          rows.forEach((row, i) => {
            const cols = row.querySelectorAll('td');
            if (cols.length >= 5) {
               const uid = cols[0]?.textContent?.trim();
               if (uid === 'UID' || !uid) return; // Skip headers or empty
               
               const type = cols[1]?.textContent?.trim().toLowerCase();
               const status = cols[2]?.textContent?.trim();
               const lat = parseFloat(cols[3]?.textContent?.trim());
               const lon = parseFloat(cols[4]?.textContent?.trim());
               const zone = cols[cols.length - 2]?.textContent?.trim();
               const ward = cols[cols.length - 1]?.textContent?.trim();
               
               allData.push({ 
                 uid, type, status, 
                 latitude: isNaN(lat) ? null : lat, 
                 longitude: isNaN(lon) ? null : lon, 
                 zone, ward 
               });
            }
          });
        } else {
          // Handle standard CSV or XLSX
          const wb = XLSX.read(bstr, {type: 'binary'});
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const json_data = XLSX.utils.sheet_to_json(ws);
          
          json_data.forEach(row => {
            const getVal = (possibleKeys) => {
               for(let k of Object.keys(row)) {
                  if (possibleKeys.includes(k.toLowerCase().trim())) return row[k];
               }
               return '';
            };
            
            const uid = getVal(['uid', 'id']);
            const type = (getVal(['type']) || '').toString().toLowerCase();
            const status = (getVal(['status']) || '').toString();
            const lat = parseFloat(getVal(['lat', 'latitude']));
            const lon = parseFloat(getVal(['lon', 'lng', 'longitude']));
            const zone = getVal(['zone', 'zonename', 'region']);
            const ward = getVal(['ward', 'wardname']);
            
            if (uid) {
               allData.push({ 
                 uid, type, status, 
                 latitude: isNaN(lat) ? null : lat, 
                 longitude: isNaN(lon) ? null : lon, 
                 zone, ward 
               });
            }
          });
        }
        
        processed++;
        if (processed === files.length) {
          setData(allData);
          setLoading(false);
        }
      };
      
      reader.readAsBinaryString(file);
    });
  };

  // Filter Data
  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter(item => {
      const typeMatch = filterType === 'All' || item.type === filterType;
      const zoneMatch = filterZone === 'All' || item.zone === filterZone;
      const wardMatch = filterWard === 'All' || item.ward === filterWard;
      return typeMatch && zoneMatch && wardMatch;
    });
  }, [data, filterType, filterZone, filterWard]);

  // Options for Dropdowns
  const zones = useMemo(() => {
    if (!data) return [];
    const z = new Set(data.map(d => d.zone).filter(Boolean));
    return Array.from(z).sort();
  }, [data]);

  const wards = useMemo(() => {
    if (!data) return [];
    let w = data;
    if (filterZone !== 'All') {
      w = w.filter(d => d.zone === filterZone);
    }
    const ws = new Set(w.map(d => d.ward).filter(Boolean));
    return Array.from(ws).sort();
  }, [data, filterZone]);

  const stats = useMemo(() => {
    const s = {
      ilm: { total: 0, comm: 0, notComm: 0 },
      ccms: { total: 0, comm: 0, notComm: 0 },
      other: { total: 0, comm: 0, notComm: 0 }
    };

    filteredData.forEach(item => {
      const isComm = item.status && !item.status.toUpperCase().includes('NOT');
      let cat = 'other';

      if (item.type === 'ilm') {
        cat = 'ilm';
      } else if (item.type === 'ccms') {
        cat = 'ccms';
      }

      s[cat].total++;
      if (isComm) s[cat].comm++;
      else s[cat].notComm++;
    });

    return s;
  }, [filteredData]);

  const mapData = useMemo(() => filteredData.filter(d => d.latitude && d.longitude), [filteredData]);

  if (loading) return <div className="loading">Processing Files...</div>;

  if (!data) {
    return (
      <div className="dashboard" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', background: 'var(--panel-bg)', padding: '3rem', borderRadius: '1rem', border: '1px dashed rgba(255,255,255,0.2)' }}>
          <h1 style={{ marginBottom: '1rem' }}>Upload VCMC Data</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Upload your .csv, .xls, or .xlsx files to generate the dashboard.</p>
          <label style={{ background: 'var(--accent)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
            Choose Files
            <input 
              type="file" 
              multiple 
              accept=".csv, .xls, .xlsx" 
              onChange={handleFileUpload} 
              style={{ display: 'none' }} 
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header>
        <h1>VCMC Entities Analytics</h1>
        
        <div className="filters">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="All">All Entities</option>
            <option value="ilm">ILM</option>
            <option value="ccms">CCMS</option>
          </select>

          <select value={filterZone} onChange={e => {
            setFilterZone(e.target.value);
            setFilterWard('All'); // Reset ward when zone changes
          }}>
            <option value="All">All Zones</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>

          <select value={filterWard} onChange={e => setFilterWard(e.target.value)}>
            <option value="All">All Wards</option>
            {wards.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          
          <button 
            onClick={() => setData(null)}
            style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}>
            Upload Different Files
          </button>
        </div>
      </header>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3>ILM Entities</h3>
          <div className="value">{stats.ilm.total.toLocaleString()}</div>
          <div className="sub-stats">
            <div className="sub-stat">
              <div className="indicator comm"></div> {stats.ilm.comm.toLocaleString()} Comm
            </div>
            <div className="sub-stat">
              <div className="indicator not-comm"></div> {stats.ilm.notComm.toLocaleString()} Not Comm
            </div>
          </div>
        </div>

        <div className="stat-card">
          <h3>CCMS Entities</h3>
          <div className="value">{stats.ccms.total.toLocaleString()}</div>
          <div className="sub-stats">
            <div className="sub-stat">
              <div className="indicator comm"></div> {stats.ccms.comm.toLocaleString()} Comm
            </div>
            <div className="sub-stat">
              <div className="indicator not-comm"></div> {stats.ccms.notComm.toLocaleString()} Not Comm
            </div>
          </div>
        </div>

        <div className="stat-card">
          <h3>Other Hubs</h3>
          <div className="value">{stats.other.total.toLocaleString()}</div>
          <div className="sub-stats">
            <div className="sub-stat">
              <div className="indicator comm"></div> {stats.other.comm.toLocaleString()} Comm
            </div>
            <div className="sub-stat">
              <div className="indicator not-comm"></div> {stats.other.notComm.toLocaleString()} Not Comm
            </div>
          </div>
        </div>
      </div>

      <div className="map-container">
        <MapContainer center={[12.92, 79.13]} zoom={11}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MarkerClusterGroup chunkedLoading maxClusterRadius={60}>
            {mapData.map((entity, idx) => (
              <Marker 
                key={idx} 
                position={[entity.latitude, entity.longitude]}
                icon={createCustomIcon(entity.type, entity.status)}
              >
                <Popup>
                  <strong>{entity.uid}</strong><br/>
                  Type: {entity.type.toUpperCase()}<br/>
                  Status: {entity.status}<br/>
                  Zone: {entity.zone}<br/>
                  Ward: {entity.ward}
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>

        <div className="legend">
          <div className="legend-section">
            <div className="legend-title">Entity Type</div>
            <div className="legend-item">
              <div className="shape-sample circle"></div> ILM Node
            </div>
            <div className="legend-item">
              <div className="shape-sample square"></div> CCMS Node
            </div>
            <div className="legend-item">
              <div className="shape-sample hub"></div> Hub
            </div>
          </div>
          
          <div className="legend-section">
            <div className="legend-title">Status</div>
            <div className="legend-item">
              <div className="color-sample comm"></div> Communicating (Blue)
            </div>
            <div className="legend-item">
              <div className="color-sample not-comm"></div> Not Communicating (Red)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
