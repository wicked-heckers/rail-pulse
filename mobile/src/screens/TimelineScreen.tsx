import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatIstTime } from '../config/apiConfig';
import { useRailStore } from '../stores/useRailStore';

export const TimelineScreen: React.FC = () => {
  const {
    selectedTrain,
    activeSnapshot,
    forecast,
    passengerStatus,
    setPassengerStatus,
  } = useRailStore();

  const liveTrain = activeSnapshot.trains?.find((t) => t.train_no === selectedTrain);
  const timeline = forecast?.station_timeline ?? [];
  const freights = activeSnapshot.phantom_freights ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Sticky Train Summary */}
      <View style={styles.headerCard}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.trainNo}>
              {liveTrain?.train_no ?? selectedTrain} · {liveTrain?.direction ?? 'DN'}
            </Text>
            <Text style={styles.trainName}>
              {liveTrain?.train_name ?? forecast?.train_name ?? 'Loading...'}
            </Text>
          </View>
          <View style={styles.delayBadge}>
            <Text style={styles.delayBadgeText}>
              +{Math.round(liveTrain?.current_delay_mins ?? forecast?.current_delay_mins ?? 0)}m
            </Text>
          </View>
        </View>

        <Text style={styles.subMeta}>
          {Math.round(liveTrain?.speed_kmph ?? 0)} km/h · Chainage{' '}
          {(liveTrain?.chainage_km ?? forecast?.current_chainage_km ?? 0).toFixed(1)} km
        </Text>

        {/* Safe-Boarding Toggle */}
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

      {/* P10 / P50 / P90 Quantile Window */}
      {forecast && (
        <View style={styles.quantileCard}>
          <Text style={styles.sectionTitle}>PROBABILISTIC ARRIVAL WINDOW</Text>
          <View style={styles.quantileRow}>
            <View style={styles.qBox}>
              <Text style={styles.qLabel}>Best (P10)</Text>
              <Text style={[styles.qTime, { color: '#059669' }]}>
                {formatIstTime(forecast.p10_eta_epoch)}
              </Text>
              <Text style={styles.qDelay}>+{Math.round(forecast.p10_delay_mins)}m</Text>
            </View>
            <View style={[styles.qBox, styles.qBoxCenter]}>
              <Text style={styles.qLabel}>Likely (P50)</Text>
              <Text style={[styles.qTime, { color: '#111827' }]}>
                {formatIstTime(forecast.p50_eta_epoch)}
              </Text>
              <Text style={styles.qDelay}>+{Math.round(forecast.p50_delay_mins)}m</Text>
            </View>
            <View style={styles.qBox}>
              <Text style={styles.qLabel}>Worst (P90)</Text>
              <Text style={[styles.qTime, { color: '#D92D20' }]}>
                {formatIstTime(forecast.p90_eta_epoch)}
              </Text>
              <Text style={styles.qDelay}>+{Math.round(forecast.p90_delay_mins)}m</Text>
            </View>
          </View>
          <Text style={styles.slackNote}>
            Usable slack deducted: {forecast.usable_slack_mins.toFixed(1)} mins · Overtakes ahead:{' '}
            {forecast.overtakes_count}
          </Text>
        </View>
      )}

      {/* Causal Overtake Cards */}
      {forecast && forecast.causal_cards.length > 0 && (
        <View style={styles.causalSection}>
          {forecast.causal_cards.map((card, idx) => (
            <View key={`${card.station_code}-${idx}`} style={styles.causalCard}>
              <Text style={styles.causalTitle}>
                Loop-Line Hold at {card.station_name} (+{Math.round(card.added_delay_mins)}m)
              </Text>
              <Text style={styles.causalMsg}>{card.human_message}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Vertical Station Timeline */}
      <View style={styles.timelineCard}>
        <Text style={styles.sectionTitle}>CORRIDOR TIMELINE</Text>
        {timeline.map((stop, idx) => {
          const currentKm = liveTrain?.chainage_km ?? 0;
          const isPassed =
            (liveTrain?.direction ?? 'DN') === 'DN'
              ? stop.chainage_km < currentKm - 1
              : stop.chainage_km > currentKm + 1;
          const isCurrent = Math.abs(stop.chainage_km - currentKm) <= 2.5;
          const nextStop = timeline[idx + 1];
          const blockFreight = nextStop
            ? freights.find(
                (f) =>
                  f.block_id.includes(stop.station_code) &&
                  f.block_id.includes(nextStop.station_code)
              )
            : undefined;

          return (
            <View key={stop.station_code}>
              <View style={styles.stopRow}>
                <View style={styles.trackCol}>
                  <View
                    style={[
                      styles.nodeDot,
                      isCurrent
                        ? styles.nodeDotCurrent
                        : isPassed
                          ? styles.nodeDotPassed
                          : styles.nodeDotFuture,
                    ]}
                  />
                  {idx < timeline.length - 1 && <View style={styles.trackLine} />}
                </View>

                <View style={styles.stopBody}>
                  <View style={styles.rowBetween}>
                    <Text
                      style={[
                        styles.stopName,
                        isPassed && { color: '#6B7280' },
                        isCurrent && { color: '#D92D20', fontWeight: '800' },
                      ]}
                    >
                      {stop.station_name} ({stop.station_code})
                    </Text>
                    <Text style={styles.stopKm}>{stop.chainage_km.toFixed(0)} km</Text>
                  </View>

                  <View style={styles.timeRow}>
                    <Text style={styles.schedTime}>
                      Sched {formatIstTime(stop.sched_arr_epoch)}
                    </Text>
                    <Text
                      style={[
                        styles.projTime,
                        { color: stop.net_delay_mins > 5 ? '#D92D20' : '#059669' },
                      ]}
                    >
                      Est {formatIstTime(stop.projected_arr_epoch)} (
                      {stop.net_delay_mins > 0
                        ? `+${Math.round(stop.net_delay_mins)}m`
                        : 'On Time'}
                      )
                    </Text>
                  </View>
                </View>
              </View>

              {blockFreight && (
                <View style={styles.freightPill}>
                  <Text style={styles.freightText}>
                    Ghost Freight Ahead ({blockFreight.block_id}) · Est. clearance{' '}
                    {Math.round(blockFreight.clearance_eta_mins ?? 15)}m at{' '}
                    {blockFreight.clearance_station ?? nextStop?.station_code}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  headerCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trainNo: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  trainName: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 2 },
  delayBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  delayBadgeText: { color: '#D92D20', fontWeight: '800', fontSize: 13 },
  subMeta: { fontSize: 12, color: '#6B7280', marginTop: 6, marginBottom: 12 },
  toggleRow: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 10, padding: 3 },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#FFFFFF' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  toggleTextActive: { color: '#111827', fontWeight: '700' },
  quantileCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8, marginBottom: 10 },
  quantileRow: { flexDirection: 'row', gap: 8 },
  qBox: { flex: 1, backgroundColor: '#FAF9F6', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  qBoxCenter: { borderColor: '#111827', backgroundColor: '#FFFFFF' },
  qLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  qTime: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  qDelay: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  slackNote: { fontSize: 11, color: '#6B7280', marginTop: 10 },
  causalSection: { gap: 8 },
  causalCard: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FECACA' },
  causalTitle: { fontSize: 13, fontWeight: '700', color: '#991B1B', marginBottom: 2 },
  causalMsg: { fontSize: 12, color: '#7F1D1D' },
  timelineCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  stopRow: { flexDirection: 'row', minHeight: 54 },
  trackCol: { width: 24, alignItems: 'center' },
  nodeDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  nodeDotCurrent: { backgroundColor: '#D92D20', width: 14, height: 14, borderRadius: 7 },
  nodeDotPassed: { backgroundColor: '#9CA3AF' },
  nodeDotFuture: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#111827' },
  trackLine: { flex: 1, width: 2, backgroundColor: '#E5E7EB', marginVertical: 2 },
  stopBody: { flex: 1, paddingBottom: 12, paddingLeft: 8 },
  stopName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  stopKm: { fontSize: 11, color: '#6B7280' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  schedTime: { fontSize: 12, color: '#6B7280' },
  projTime: { fontSize: 12, fontWeight: '700' },
  freightPill: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 8, padding: 8, marginLeft: 32, marginBottom: 10 },
  freightText: { fontSize: 11, fontWeight: '600', color: '#B45309' },
});
