import streamlit as st
import pandas as pd
import folium
from folium.plugins import MarkerCluster
from streamlit_folium import st_folium
import os
import re

st.set_page_config(page_title="VCMC Analytics", layout="wide", page_icon="🗺️")

@st.cache_data
def load_data():
    files = ['entities_table_entities (1).xls', 'entities_table_entities.xls']
    data = []

    row_pattern = re.compile(r'<tr>(.*?)</tr>', re.IGNORECASE | re.DOTALL)
    col_pattern = re.compile(r'<td.*?>(.*?)</td>', re.IGNORECASE | re.DOTALL)

    for file in files:
        if os.path.exists(file):
            try:
                with open(file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                rows = row_pattern.findall(content)
                for row in rows:
                    cols = col_pattern.findall(row)
                    if len(cols) >= 5:
                        clean_cols = [re.sub(r'<[^>]+>', '', c).strip() for c in cols]
                        if clean_cols[0] == 'UID':
                            continue
                        
                        uid = clean_cols[0]
                        type_str = clean_cols[1].lower() if len(clean_cols) > 1 else ''
                        status = clean_cols[2] if len(clean_cols) > 2 else ''
                        lat_str = clean_cols[3] if len(clean_cols) > 3 else ''
                        lon_str = clean_cols[4] if len(clean_cols) > 4 else ''
                        
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
                            'longitude': lon
                        })
            except Exception as e:
                pass
                
    return pd.DataFrame(data)

st.title("🗺️ VCMC Entities Dashboard")
st.markdown("Analytics and map visualization of ILM and CCMS entities.")

with st.spinner("Loading and parsing data..."):
    df = load_data()

if df.empty:
    st.error("No data found. Please ensure the XLS files are in the same folder.")
    st.stop()

# --- Analytics Section ---
st.subheader("📊 Analytics Overview")

col1, col2, col3 = st.columns(3)

def show_metric_card(column, title, data_subset):
    total = len(data_subset)
    comm = len(data_subset[~data_subset['status'].str.contains('NOT', na=False, case=False)])
    not_comm = total - comm
    
    column.metric(label=f"Total {title}", value=f"{total:,}")
    column.caption(f"✅ Communicating: **{comm:,}**")
    column.caption(f"❌ Not Communicating: **{not_comm:,}**")

ilm_data = df[df['type'] == 'ilm']
ccms_data = df[df['type'] == 'ccms']
other_data = df[~df['type'].isin(['ilm', 'ccms'])]

with col1:
    show_metric_card(col1, "ILM Entities", ilm_data)
with col2:
    show_metric_card(col2, "CCMS Entities", ccms_data)
with col3:
    show_metric_card(col3, "Other Entities (Hubs)", other_data)

st.divider()

# --- Map Section ---
st.subheader("📍 Heatmap & Locations")
st.markdown("Different shapes and colors identify different entities.")
st.markdown("🟢 **Green Circle**: ILM | 🟠 **Orange Square**: CCMS | 🟣 **Purple Star**: Hub")

# Filter only valid coordinates
map_df = df.dropna(subset=['latitude', 'longitude'])

if not map_df.empty:
    # Initialize Map
    center_lat = map_df['latitude'].mean()
    center_lon = map_df['longitude'].mean()
    m = folium.Map(location=[center_lat, center_lon], zoom_start=11, tiles="CartoDB dark_matter")

    # We use a marker cluster for the heatmap effect
    marker_cluster = MarkerCluster().add_to(m)

    for idx, row in map_df.iterrows():
        # Choose shape/color based on type
        color = 'gray'
        icon = 'info-sign'
        
        if row['type'] == 'ilm':
            color = 'green'
            icon = 'circle'
        elif row['type'] == 'ccms':
            color = 'orange'
            icon = 'stop' # square shape
        else:
            color = 'purple'
            icon = 'star'

        folium.Marker(
            location=[row['latitude'], row['longitude']],
            popup=f"<b>UID:</b> {row['uid']}<br><b>Type:</b> {row['type'].upper()}<br><b>Status:</b> {row['status']}",
            icon=folium.Icon(color=color, icon=icon, prefix='glyphicon')
        ).add_to(marker_cluster)

    # Render Map in Streamlit
    st_folium(m, width=1200, height=600, returned_objects=[])
else:
    st.warning("No valid GPS coordinates found in the dataset to display on the map.")
