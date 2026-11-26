import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatIstTime } from '../config/apiConfig';
import { useRailStore } from '../stores/useRailStore';

const DESTINATIONS = ['CTC', 'BBS', 'KUR', 'PURI'];

export const RescueScreen: React.FC = () => {
  const {
    selectedTrain,
    passengerStatus,
    destinationCode,
    rescue,
    setPassengerStatus,
    setDestinationCode,
  } = useRailStore();
  const [cabBooked, setCabBooked] = useState(false);

  const survival = rescue?.survival_probability_pct ?? 0;
  const riskColor =
    rescue?.risk_level === 'SAFE'
      ? '#059669'
      : rescue?.risk_level === 'WATCH'
        ? '#D97706'
        : '#D92D20';

  const handleBookCab = () => {
    setCabBooked(true);
    Alert.alert(
      'NH-16 Rescue Cab Reserved (Demo)',
      `Pickup arranged at ${rescue?.bailout_plan?.deboard_station_name ?? 'Cuttack Junction'} to ${rescue?.bailout_plan?.destination_station_name ?? destinationCode}.`
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>CONNECTION GUARD · TRAIN {selectedTrain}</Text>
        <Text style={styles.heading}>Target Destination</Text>
        <View style={styles.destRow}>
          {DESTINATIONS.map((code) => (
            <Pressable
              key={code}
              onPress={() => {
                setCabBooked(false);
                setDestinationCode(code);
              }}
              style={[
                styles.destChip,
                destinationCode === code && styles.destChipActive,
              ]}
            >
              <Text
                style={[
                  styles.destChipText,
                  destinationCode === code && styles.destChipTextActive,
                ]}
              >
                {code}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.heading, { marginTop: 14 }]}>Boarding Status</Text>
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setPassengerStatus('PRE_BOARDING')}
            style={[
              styles.toggleBtn,
              passengerStatus === 'PRE_BOARDING' && styles.toggleBtnActive,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                passengerStatus === 'PRE_BOARDING' && styles.toggleTextActive,
              ]}
            >
              At Station
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPassengerStatus('ON_BOARD')}
            style={[
              styles.toggleBtn,
              passengerStatus === 'ON_BOARD' && styles.toggleBtnActive,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                passengerStatus === 'ON_BOARD' && styles.toggleTextActive,
              ]}
            >
              On Board
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Survival Meter */}
      <View style={styles.card}>
        <Text style={styles.label}>CONNECTION SURVIVAL PROBABILITY</Text>
        <View style={styles.survivalRow}>
          <Text style={[styles.survivalPct, { color: riskColor }]}>
            {survival.toFixed(1)}%
          </Text>
          <Text style={[styles.riskBadge, { color: riskColor }]}>
            {rescue?.risk_level ?? 'EVALUATING'}
          </Text>
        </View>
        <View style={styles.barBg}>
          <View
            style={[
              styles.barFill,
              { width: `${Math.min(100, Math.max(4, survival))}%`, backgroundColor: riskColor },
            ]}
          />
        </View>
        {rescue?.boarding_advisory && (
          <Text style={styles.advisory}>{rescue.boarding_advisory}</Text>
        )}
      </View>

      {/* Safe-Boarding Lock Banner */}
      {rescue?.safe_boarding_lock && (
        <View style={styles.lockCard}>
          <Text style={styles.lockTitle}>Safe-Boarding Guardrail Active</Text>
          <Text style={styles.lockBody}>
            Reach your boarding station by official timetable. Predictive road bailout unlocks once you are On Board.
          </Text>
        </View>
      )}

      {/* Early-Junction Multimodal Bailout */}
      {!rescue?.safe_boarding_lock && rescue?.bailout_recommended && rescue.bailout_plan && (
        <View style={styles.rescueCard}>
          <Text style={styles.rescueTag}>EARLY-JUNCTION MULTIMODAL RESCUE</Text>
          <Text style={styles.rescueHeadline}>
            Save ~{Math.round(rescue.bailout_plan.minutes_saved)} mins — Deboard at{' '}
            {rescue.bailout_plan.deboard_station_name}
          </Text>
          <Text style={styles.rescueBody}>{rescue.bailout_plan.human_guidance}</Text>

          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricVal}>
                {formatIstTime(rescue.bailout_plan.deboard_eta_epoch)}
              </Text>
              <Text style={styles.metricLbl}>Deboard ETA</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricVal}>
                {Math.round(rescue.bailout_plan.road_drive_mins)} min
              </Text>
              <Text style={styles.metricLbl}>NH-16 Drive</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={[styles.metricVal, { color: '#059669' }]}>
                {Math.round(rescue.bailout_plan.road_survival_pct)}%
              </Text>
              <Text style={styles.metricLbl}>Road Survival</Text>
            </View>
          </View>

          <Pressable
            onPress={handleBookCab}
            style={[styles.cabBtn, cabBooked && styles.cabBtnDone]}
          >
            <Text style={styles.cabBtnText}>
              {cabBooked ? 'NH-16 Rescue Cab Reserved' : 'Reserve NH-16 Rescue Cab'}
            </Text>
          </Pressable>
        </View>
      )}

      {rescue?.disclaimer && <Text style={styles.disclaimer}>{rescue.disclaimer}</Text>}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  label: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.7, marginBottom: 8 },
  heading: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 8 },
  destRow: { flexDirection: 'row', gap: 8 },
  destChip: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: '#FAF9F6' },
  destChipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  destChipText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  destChipTextActive: { color: '#FFFFFF' },
  toggleRow: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 10, padding: 3 },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#FFFFFF' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  toggleTextActive: { color: '#111827', fontWeight: '700' },
  survivalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  survivalPct: { fontSize: 30, fontWeight: '800' },
  riskBadge: { fontSize: 12, fontWeight: '800' },
  barBg: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  advisory: { fontSize: 12, color: '#4B5563', marginTop: 10 },
  lockCard: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1, borderRadius: 14, padding: 14 },
  lockTitle: { fontSize: 14, fontWeight: '700', color: '#1E40AF', marginBottom: 4 },
  lockBody: { fontSize: 12, color: '#1E3A8A' },
  rescueCard: { backgroundColor: '#ECFDF5', borderColor: '#059669', borderWidth: 1.5, borderRadius: 14, padding: 14 },
  rescueTag: { fontSize: 11, fontWeight: '800', color: '#059669', letterSpacing: 0.7 },
  rescueHeadline: { fontSize: 17, fontWeight: '800', color: '#065F46', marginTop: 4, marginBottom: 6 },
  rescueBody: { fontSize: 13, color: '#064E3B', marginBottom: 12 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricBox: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, alignItems: 'center' },
  metricVal: { fontSize: 14, fontWeight: '800', color: '#111827' },
  metricLbl: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  cabBtn: { backgroundColor: '#059669', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cabBtnDone: { backgroundColor: '#065F46' },
  cabBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  disclaimer: { fontSize: 11, color: '#6B7280', textAlign: 'center', marginTop: 4 },
});
