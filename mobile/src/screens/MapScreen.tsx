import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { injectTrainDelay, resetCorridor } from '../services/api';
import { ECOR_STATIONS } from '../services/mockFallback';
import { useRailStore } from '../stores/useRailStore';

const MapWebView = WebView as unknown as React.ComponentType<any>;

export const MapScreen: React.FC = () => {
  const {
    activeSnapshot,
    backendOrigin,
    selectedTrain,
    wsConnected,
    injectLocalDelay,
    resetLocalSim,
  } = useRailStore();
  const webViewRef = useRef<any>(null);
  const trains = activeSnapshot.trains ?? [];

  const htmlContent = useMemo(() => {
    const stationsJson = JSON.stringify(ECOR_STATIONS);
    const initialTrainsJson = JSON.stringify(trains);
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link href="https://unpkg.com/maplibre-gl@5.1.0/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@5.1.0/dist/maplibre-gl.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #FAF9F6; font-family: sans-serif; }
    .train-pill {
      padding: 4px 8px;
      border-radius: 999px;
      color: #fff;
      font-weight: 800;
      font-size: 11px;
      border: 2px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      white-space: nowrap;
    }
    .stn-label {
      background: rgba(255,255,255,0.92);
      color: #111827;
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      border: 1px solid #D1D5DB;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const STATIONS = ${stationsJson};
    const INIT_TRAINS = ${initialTrainsJson};

    const map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [85.95, 20.46],
      zoom: 8.2,
      attributionControl: false
    });

    const trainMarkers = {};

    function updateTrains(list) {
      list.forEach((t) => {
        const lng = t.lon || 85.8829;
        const lat = t.lat || 20.4625;
        const bg = t.current_delay_mins >= 10 ? '#D92D20' : (t.priority_rank === 1 ? '#D97706' : '#059669');
        const label = t.train_no + ' (' + Math.round(t.speed_kmph) + ' km/h)';
        if (!trainMarkers[t.train_no]) {
          const el = document.createElement('div');
          el.className = 'train-pill';
          el.style.background = bg;
          el.textContent = label;
          trainMarkers[t.train_no] = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);
        } else {
          const m = trainMarkers[t.train_no];
          m.setLngLat([lng, lat]);
          m.getElement().style.background = bg;
          m.getElement().textContent = label;
        }
      });
    }

    map.on('load', () => {
      map.addSource('corridor-line', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: STATIONS.map(s => [s.lon, s.lat])
          }
        }
      });
      map.addLayer({
        id: 'corridor-line-layer',
        type: 'line',
        source: 'corridor-line',
        paint: { 'line-color': '#111827', 'line-width': 3.5 }
      });

      STATIONS.forEach((s) => {
        const el = document.createElement('div');
        el.className = 'stn-label';
        el.textContent = s.station_code;
        new maplibregl.Marker({ element: el })
          .setLngLat([s.lon, s.lat])
          .addTo(map);
      });

      updateTrains(INIT_TRAINS);
    });

    function handleMessage(event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg && msg.type === 'TRAINS_UPDATE' && Array.isArray(msg.trains)) {
          updateTrains(msg.trains);
        }
      } catch (e) {}
    }
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);
  </script>
</body>
</html>`;
  }, []);

  useEffect(() => {
    const payload = JSON.stringify({ type: 'TRAINS_UPDATE', trains });
    webViewRef.current?.postMessage(payload);
  }, [trains]);

  const handleDelay = () => {
    injectLocalDelay(selectedTrain, 15);
    if (wsConnected) {
      injectTrainDelay(backendOrigin, selectedTrain, 15).catch(() => {});
    }
  };

  const handleReset = () => {
    resetLocalSim();
    if (wsConnected) {
      resetCorridor(backendOrigin).catch(() => {});
    }
  };

  return (
    <View style={styles.container}>
      <MapWebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.map}
        javaScriptEnabled
        domStorageEnabled
      />

      <View style={styles.overlayBar}>
        <Text style={styles.overlayTitle}>
          MapLibre Radar · {trains.length} Trains · {activeSnapshot.mode}
        </Text>
        <View style={styles.btnRow}>
          <Pressable style={styles.delayBtn} onPress={handleDelay}>
            <Text style={styles.delayBtnText}>+15m Delay ({selectedTrain})</Text>
          </Pressable>
          <Pressable style={styles.resetBtn} onPress={handleReset}>
            <Text style={styles.resetBtnText}>Reset</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },
  map: { flex: 1 },
  overlayBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  overlayTitle: { fontSize: 12, fontWeight: '700', color: '#111827', marginBottom: 8 },
  btnRow: { flexDirection: 'row', gap: 8 },
  delayBtn: { flex: 1, backgroundColor: '#FEE2E2', paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  delayBtnText: { color: '#D92D20', fontSize: 12, fontWeight: '700' },
  resetBtn: { backgroundColor: '#F3F4F6', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  resetBtnText: { color: '#111827', fontSize: 12, fontWeight: '700' },
});
