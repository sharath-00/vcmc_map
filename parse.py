import os
import json
import re

files = ['entities_table_entities (1).xls', 'entities_table_entities.xls']
data = []

row_pattern = re.compile(r'<tr>(.*?)</tr>', re.IGNORECASE | re.DOTALL)
col_pattern = re.compile(r'<td.*?>(.*?)</td>', re.IGNORECASE | re.DOTALL)

for file in files:
    if os.path.exists(file):
        print(f"Reading {file}...")
        try:
            with open(file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            rows = row_pattern.findall(content)
            for row in rows:
                cols = col_pattern.findall(row)
                if len(cols) >= 5:
                    # Clean up bold tags inside columns if any (like headers)
                    clean_cols = [re.sub(r'<[^>]+>', '', c).strip() for c in cols]
                    
                    if clean_cols[0] == 'UID':
                        continue # Header row
                    
                    uid = clean_cols[0]
                    type_str = clean_cols[1].lower() if len(clean_cols) > 1 else ''
                    status = clean_cols[2] if len(clean_cols) > 2 else ''
                    lat_str = clean_cols[3] if len(clean_cols) > 3 else ''
                    lon_str = clean_cols[4] if len(clean_cols) > 4 else ''
                    
                    # The number of columns varies between 11 and 13 in the HTML,
                    # but zone and ward are always the last two columns.
                    zone = clean_cols[-2] if len(clean_cols) >= 2 else ''
                    ward = clean_cols[-1] if len(clean_cols) >= 1 else ''
                    
                    lat = None
                    lon = None
                    try:
                        lat = float(lat_str) if lat_str else None
                        lon = float(lon_str) if lon_str else None
                    except ValueError:
                        pass
                        
                    data.append({
                        'uid': uid,
                        'type': type_str,
                        'status': status,
                        'latitude': lat,
                        'longitude': lon,
                        'zone': zone,
                        'ward': ward
                    })
        except Exception as e:
            print(f"Error reading {file}: {e}")

out_path = os.path.join('analytics-app', 'public', 'data.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)

print(f"Exported {len(data)} records to {out_path}")
