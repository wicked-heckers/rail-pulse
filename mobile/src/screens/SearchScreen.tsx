import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { wsClient } from '../services/wsClient';
import { useRailStore } from '../stores/useRailStore';

export const SearchScreen: React.FC = () => {
  const {
    activeSnapshot,
    backendOrigin,
    wsConnected,
    wsStatusText,
    selectedTrain,
    setBackendOrigin,
    selectTrainAndOpen,
  } = useRailStore();

  const [query, setQuery] = useState('');
  const [urlInput, setUrlInput] = useState(backendOrigin);
  const [showServerEdit, setShowServerEdit] = useState(false);

  const trains = activeSnapshot.trains ?? [];
  const filtered = trains.filter((t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      t.train_no.toLowerCase().includes(q) ||
      t.train_name.toLowerCase().includes(q)
    );
  });

  const handleSaveServer = () => {
    const trimmed = urlInput.trim();
    if (trimmed) {
      setBackendOrigin(trimmed);
      wsClient.connect(trimmed);
    }
    setShowServerEdit(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>RAIL-PULSE</Text>
          <Text style={styles.subtitle}>ECoR Corridor · Bhadrak → Puri</Text>
        </View>
        <Pressable
          onPress={() => setShowServerEdit((v) => !v)}
          style={[
            styles.statusBadge,
            wsConnected ? styles.badgeOnline : styles.badgeOffline,
          ]}
        >
          <View
            style={[
              styles.dot,
              { backgroundColor: wsConnected ? '#059669' : '#D97706' },
            ]}
          />
          <Text style={styles.statusText}>{wsStatusText}</Text>
        </Pressable>
      </View>

      {showServerEdit && (
        <View style={styles.serverCard}>
          <Text style={styles.serverLabel}>
            Backend URL (use PC LAN IP for physical phone, 10.0.2.2 for Android Emulator)
          </Text>
          <View style={styles.serverRow}>
            <TextInput
              style={styles.serverInput}
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="http://192.168.1.10:8000"
            />
            <Pressable style={styles.saveBtn} onPress={handleSaveServer}>
              <Text style={styles.saveBtnText}>Connect</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.pulseStrip}>
        <View style={styles.pulsePill}>
          <Text style={styles.pulseValue}>{trains.length}</Text>
          <Text style={styles.pulseLabel}>Active Trains</Text>
        </View>
        <View style={styles.pulsePill}>
          <Text style={[styles.pulseValue, { color: '#D97706' }]}>
            {activeSnapshot.phantom_freights?.length ?? 0}
          </Text>
          <Text style={styles.pulseLabel}>Freight Shadows</Text>
        </View>
        <View style={styles.pulsePill}>
          <Text style={styles.pulseValue}>
            {activeSnapshot.weather?.rain_mm_hr ?? 0} mm
          </Text>
          <Text style={styles.pulseLabel}>
            {activeSnapshot.weather?.condition ?? 'CLEAR'}
          </Text>
        </View>
      </View>

      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Search train no. or name (e.g. 12821, Vande Bharat)"
        placeholderTextColor="#6B7280"
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.train_no}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isDelayed = item.current_delay_mins >= 10;
          const isSelected = item.train_no === selectedTrain;
          return (
            <Pressable
              onPress={() => selectTrainAndOpen(item.train_no)}
              style={[styles.trainCard, isSelected && styles.trainCardSelected]}
            >
              <View style={styles.cardTop}>
                <View style={styles.trainTitleRow}>
                  <Text style={styles.trainNo}>{item.train_no}</Text>
                  <Text style={styles.dirBadge}>{item.direction}</Text>
                </View>
                <View
                  style={[
                    styles.delayPill,
                    { backgroundColor: isDelayed ? '#FEE2E2' : '#D1FAE5' },
                  ]}
                >
                  <Text
                    style={[
                      styles.delayText,
                      { color: isDelayed ? '#D92D20' : '#059669' },
                    ]}
                  >
                    {item.current_delay_mins > 0
                      ? `+${Math.round(item.current_delay_mins)}m late`
                      : 'On Time'}
                  </Text>
                </View>
              </View>

              <Text style={styles.trainName}>{item.train_name}</Text>

              <View style={styles.cardBottom}>
                <Text style={styles.metaText}>
                  {item.current_station
                    ? `At ${item.current_station}`
                    : `Next: ${item.next_station ?? 'Enroute'}`}{' '}
                  · {item.chainage_km.toFixed(1)} km
                </Text>
                <Text style={styles.speedText}>{Math.round(item.speed_kmph)} km/h</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6', paddingHorizontal: 16, paddingTop: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  brand: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  badgeOnline: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  badgeOffline: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: '600', color: '#111827' },
  serverCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  serverLabel: { fontSize: 11, color: '#6B7280', marginBottom: 6 },
  serverRow: { flexDirection: 'row', gap: 8 },
  serverInput: { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: '#111827' },
  saveBtn: { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  pulseStrip: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pulsePill: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  pulseValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  pulseLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  searchInput: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#111827', marginBottom: 12 },
  listContent: { paddingBottom: 24, gap: 10 },
  trainCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  trainCardSelected: { borderColor: '#111827', borderWidth: 1.5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  trainTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trainNo: { fontSize: 17, fontWeight: '800', color: '#111827' },
  dirBadge: { fontSize: 11, fontWeight: '700', color: '#4B5563', backgroundColor: '#F3F4F6', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  delayPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  delayText: { fontSize: 12, fontWeight: '700' },
  trainName: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginBottom: 8 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 12, color: '#6B7280' },
  speedText: { fontSize: 12, fontWeight: '700', color: '#111827' },
});
