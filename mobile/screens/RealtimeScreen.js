import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl } from 'react-native';
import { API_BASE, COLORS, getLaneColor, timeAgo } from '../constants';

function LaneCard({ lane, isBest }) {
  const c = getLaneColor(lane.speed);
  return (
    <View style={[styles.laneCard, { backgroundColor: c.bg }]}>
      {isBest && <View style={styles.bestBadge}><Text style={styles.bestBadgeText}>最快</Text></View>}
      {lane.is_shoulder && <View style={styles.shoulderBadge}><Text style={styles.shoulderBadgeText}>路肩</Text></View>}
      <Text style={[styles.laneName, { color: c.text }]}>
        {lane.name}{lane.is_shoulder && lane.shoulder_speed_limit ? ` 限${lane.shoulder_speed_limit}` : ''}
      </Text>
      <Text style={styles.laneSpeed}>{Math.round(lane.speed)}</Text>
      <Text style={[styles.laneUnit, { color: c.text }]}>km/h</Text>
    </View>
  );
}

function AdviceBar({ advice }) {
  if (!advice) return null;
  const isSwitch = advice.speed_diff >= 15;
  return (
    <View style={[styles.adviceBar, { backgroundColor: isSwitch ? COLORS.green : COLORS.card }]}>
      <Text style={styles.adviceAction}>{advice.action}</Text>
      <Text style={styles.adviceDetail}>{advice.message}</Text>
      {advice.shoulder_note ? <Text style={styles.shoulderNote}>{advice.shoulder_note}</Text> : null}
    </View>
  );
}

export default function RealtimeScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const road = '1', dir = 'N', km = 88;

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/v1/lanes/realtime?road=${road}&dir=${dir}&km=${km}`);
      if (resp.ok) {
        const json = await resp.json();
        setData(json);
        setLastUpdate(new Date().toISOString());
        setError(null);
      } else {
        const err = await resp.json().catch(() => ({}));
        setError(err.detail || `HTTP ${resp.status}`);
      }
    } catch (e) {
      setError(`連線失敗: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const bestLane = data?.lanes?.reduce((best, lane) =>
    (!lane.is_shoulder && lane.speed > (best?.speed || 0)) ? lane : best, null);

  return (
    <ScrollView
      style={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={COLORS.green} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>國{road} {dir === 'N' ? '北向' : '南向'}</Text>
          <Text style={styles.headerSub}>{data?.location || '載入中...'} | {km}K</Text>
        </View>
        <Text style={styles.updateText}>{lastUpdate ? timeAgo(lastUpdate) + '更新' : ''}</Text>
      </View>

      {loading && <Text style={styles.loadingText}>正在載入即時資料...</Text>}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>請確認後端 API 正在執行 (port 8000)</Text>
        </View>
      )}

      {data?.advice && <AdviceBar advice={data.advice} />}

      {data?.lanes && (
        <View>
          <Text style={styles.sectionLabel}>各車道即時速度</Text>
          <View style={styles.lanesGrid}>
            {data.lanes.map((lane, idx) => (
              <LaneCard key={idx} lane={lane} isBest={bestLane && lane.name === bestLane.name && !lane.is_shoulder} />
            ))}
          </View>
        </View>
      )}

      <Text style={styles.footer}>每 30 秒自動刷新 | 下拉手動刷新</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  headerTitle: { color: COLORS.white, fontSize: 22, fontWeight: '600' },
  headerSub: { color: COLORS.gray, fontSize: 13, marginTop: 2 },
  updateText: { color: COLORS.dimGray, fontSize: 12 },
  loadingText: { color: COLORS.gray, textAlign: 'center', padding: 40, fontSize: 15 },
  errorBox: { margin: 16, padding: 16, backgroundColor: COLORS.redBg, borderRadius: 12 },
  errorText: { color: COLORS.redText, fontSize: 14, fontWeight: '500' },
  errorHint: { color: COLORS.redText, fontSize: 12, marginTop: 4, opacity: 0.7 },
  adviceBar: { marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 14 },
  adviceAction: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  adviceDetail: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  shoulderNote: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  sectionLabel: { color: COLORS.dimGray, fontSize: 12, marginLeft: 20, marginBottom: 8 },
  lanesGrid: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, flexWrap: 'wrap' },
  laneCard: { flex: 1, minWidth: 70, borderRadius: 12, padding: 12, alignItems: 'center' },
  laneName: { fontSize: 12, marginBottom: 6 },
  laneSpeed: { color: COLORS.white, fontSize: 28, fontWeight: '600' },
  laneUnit: { fontSize: 11, marginTop: 2 },
  bestBadge: { backgroundColor: '#5DCAA5', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4 },
  bestBadgeText: { color: '#04342C', fontSize: 10, fontWeight: '600' },
  shoulderBadge: { backgroundColor: '#444', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4 },
  shoulderBadgeText: { color: '#aaa', fontSize: 10, fontWeight: '500' },
  footer: { color: COLORS.dimGray, fontSize: 10, textAlign: 'center', padding: 20 },
});
