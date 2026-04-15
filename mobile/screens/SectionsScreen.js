import { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { API_BASE, COLORS, getLaneColor } from '../constants';

async function fetchWithRetry(url, { retries = 3, delay = 3000 } = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url);
      if (resp.status === 503 && i < retries) {
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return resp;
    } catch (e) {
      if (i < retries) {
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
}

const ROADS = [
  { label: '國1', value: '1' },
  { label: '國3', value: '3' },
  { label: '國1高架', value: '1H' },
];

const SEGMENTS = {
  '1': [
    { label: '基隆-汐止', km_min: 0, km_max: 15 },
    { label: '汐止-林口', km_min: 15, km_max: 42 },
    { label: '林口-中壢', km_min: 42, km_max: 62 },
    { label: '中壢-新竹', km_min: 62, km_max: 100 },
    { label: '新竹-苗栗', km_min: 100, km_max: 132 },
    { label: '苗栗-台中', km_min: 132, km_max: 178 },
    { label: '台中-彰化', km_min: 178, km_max: 198 },
    { label: '彰化-嘉義', km_min: 198, km_max: 240 },
    { label: '嘉義-新營', km_min: 240, km_max: 272 },
    { label: '新營-台南', km_min: 272, km_max: 315 },
    { label: '台南-高雄', km_min: 315, km_max: 357 },
    { label: '全路段', km_min: 0, km_max: 999 },
  ],
  '3': [
    { label: '基隆-木柵', km_min: 0, km_max: 27 },
    { label: '木柵-三鶯', km_min: 27, km_max: 50 },
    { label: '三鶯-龍潭', km_min: 50, km_max: 67 },
    { label: '龍潭-寶山', km_min: 67, km_max: 100 },
    { label: '寶山-竹南', km_min: 100, km_max: 140 },
    { label: '竹南-苑裡', km_min: 140, km_max: 176 },
    { label: '苑裡-彰化', km_min: 176, km_max: 210 },
    { label: '彰化-霧峰', km_min: 210, km_max: 243 },
    { label: '霧峰-竹山', km_min: 243, km_max: 280 },
    { label: '竹山-古坑', km_min: 280, km_max: 310 },
    { label: '古坑-白河', km_min: 310, km_max: 340 },
    { label: '白河-高雄', km_min: 340, km_max: 400 },
    { label: '全路段', km_min: 0, km_max: 999 },
  ],
  '1H': [
    { label: '汐止-中壢', km_min: 12, km_max: 33 },
    { label: '全路段', km_min: 0, km_max: 999 },
  ],
};

const DEFAULT_SEG = { '1': 3, '3': 3, '1H': 0 };
const PREVIEW_COUNT = 12;

// =====================================================
// 站點列（可展開）
// =====================================================
function StationRow({ station }) {
  const [open, setOpen] = useState(false);
  const mainLanes = station.lanes.filter(l => !l.is_shoulder);
  const avgSpeed = mainLanes.length > 0
    ? Math.round(mainLanes.reduce((s, l) => s + l.speed, 0) / mainLanes.length) : 0;
  return (
    <View>
      <TouchableOpacity style={styles.stationRow} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Text style={styles.stationKm}>{station.mileage}K</Text>
        <View style={styles.laneBands}>
          {mainLanes.map((lane, i) => {
            const c = getLaneColor(lane.speed);
            return <View key={i} style={[styles.laneBand, { backgroundColor: c.bar }]} />;
          })}
        </View>
        <Text style={styles.stationSpeed}>{avgSpeed}</Text>
        <Text style={styles.stationArrow}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.laneDetail}>
          {mainLanes.map((lane, i) => {
            const c = getLaneColor(lane.speed);
            return (
              <View key={i} style={styles.laneDetailRow}>
                <View style={[styles.laneDetailDot, { backgroundColor: c.bar }]} />
                <Text style={styles.laneDetailName}>{lane.name}</Text>
                <View style={[styles.laneDetailBar, { width: `${Math.min(lane.speed / 120 * 100, 100)}%`, backgroundColor: c.bar }]} />
                <Text style={[styles.laneDetailSpeed, { color: c.bar }]}>{Math.round(lane.speed)}</Text>
              </View>
            );
          })}
          {station.lanes.filter(l => l.is_shoulder).map((lane, i) => (
            <View key={`sh${i}`} style={styles.laneDetailRow}>
              <View style={[styles.laneDetailDot, { backgroundColor: '#555' }]} />
              <Text style={[styles.laneDetailName, { color: '#888' }]}>路肩{lane.shoulder_speed_limit ? ` ≤${lane.shoulder_speed_limit}` : ''}</Text>
              <View style={[styles.laneDetailBar, { width: `${Math.min(lane.speed / 120 * 100, 100)}%`, backgroundColor: '#555' }]} />
              <Text style={[styles.laneDetailSpeed, { color: '#888' }]}>{Math.round(lane.speed)}</Text>
            </View>
          ))}
          <Text style={styles.laneDetailLoc}>{station.location}</Text>
        </View>
      )}
    </View>
  );
}

// =====================================================
// 主頁面 - 路段總覽
// =====================================================
export default function SectionsScreen() {
  const [road, setRoad] = useState('1');
  const [dir, setDir] = useState('N');
  const [segIdx, setSegIdx] = useState(DEFAULT_SEG['1']);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const segments = SEGMENTS[road] || [];
  const seg = segments[segIdx] || segments[0];

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const resp = await fetchWithRetry(
        `${API_BASE}/api/v1/sections?road=${road}&dir=${dir}&km_min=${seg.km_min}&km_max=${seg.km_max}`
      );
      if (resp.ok) {
        setData(await resp.json());
      } else {
        setError('目前無法取得路況資料，請稍後再試');
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError('網路連線異常，請下拉重新整理');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [road, dir, seg.km_min, seg.km_max]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setExpanded(false);
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const switchRoad = (newRoad) => {
    setError(null);
    setRoad(newRoad);
    setSegIdx(DEFAULT_SEG[newRoad] || 0);
  };

  const stations = data?.stations || [];
  const showStations = expanded ? stations : stations.slice(0, PREVIEW_COUNT);
  const hasMore = stations.length > PREVIEW_COUNT;

  return (
    <ScrollView
      style={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={COLORS.green} />}
    >
      <Text style={styles.pageTitle}>路段總覽</Text>

      {/* 國道選擇 */}
      <View style={styles.pickerRow}>
        {ROADS.map(r => (
          <TouchableOpacity key={r.value} style={[styles.pickerBtn, road === r.value && styles.pickerActive]}
            onPress={() => switchRoad(r.value)}>
            <Text style={[styles.pickerText, road === r.value && styles.pickerActiveText]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 方向選擇 */}
      <View style={styles.dirRow}>
        <TouchableOpacity style={[styles.dirBtn, dir === 'N' && styles.dirActive]} onPress={() => { setError(null); setDir('N'); }}>
          <Text style={[styles.dirText, dir === 'N' && styles.dirActiveText]}>北向</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.dirBtn, dir === 'S' && styles.dirActive]} onPress={() => { setError(null); setDir('S'); }}>
          <Text style={[styles.dirText, dir === 'S' && styles.dirActiveText]}>南向</Text>
        </TouchableOpacity>
      </View>

      {/* 路段選擇 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.segScroll} contentContainerStyle={styles.segContainer}>
        {segments.map((s, idx) => (
          <TouchableOpacity key={idx} style={[styles.segBtn, segIdx === idx && styles.segActive]}
            onPress={() => { setError(null); setSegIdx(idx); }}>
            <Text style={[styles.segText, segIdx === idx && styles.segActiveText]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && <Text style={styles.loadingText}>載入中..</Text>}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* 摘要 */}
      {data?.summary && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryVal}>{data.summary.station_count}</Text>
            <Text style={styles.summaryLabel}>VD 站</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryVal}>{data.summary.est_minutes}</Text>
            <Text style={styles.summaryLabel}>分鐘</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryVal, { color: data.summary.bottleneck_count > 0 ? COLORS.yellow : COLORS.green }]}>
              {data.summary.bottleneck_count}
            </Text>
            <Text style={styles.summaryLabel}>瓶頸</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryVal}>{data.summary.avg_speed}</Text>
            <Text style={styles.summaryLabel}>均速</Text>
          </View>
        </View>
      )}

      {/* 色帶 + 站點 */}
      {stations.length > 0 && (
        <View style={styles.bandSection}>
          <View style={styles.bandHeader}>
            <Text style={styles.bandTitle}>各站車道速度 ({stations.length} 站)</Text>
            {hasMore && (
              <TouchableOpacity onPress={() => setExpanded(!expanded)}>
                <Text style={styles.expandBtn}>{expanded ? '收合' : '展開全部'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#1DB954' }]} /><Text style={styles.legendText}>&gt;80</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#66BB6A' }]} /><Text style={styles.legendText}>60-80</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#FFA726' }]} /><Text style={styles.legendText}>40-60</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#EF5350' }]} /><Text style={styles.legendText}>20-40</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#8B0000' }]} /><Text style={styles.legendText}>&lt;20</Text></View>
          </View>
          {showStations.map((station, idx) => (
            <StationRow key={idx} station={station} />
          ))}
          {hasMore && !expanded && (
            <TouchableOpacity style={styles.expandBar} onPress={() => setExpanded(true)}>
              <Text style={styles.expandBarText}>還有 {stations.length - PREVIEW_COUNT} 站，展開查看</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* 瓶頸 */}
      {data?.bottlenecks?.length > 0 && (
        <View>
          <Text style={styles.bnSectionTitle}>瓶頸路段</Text>
          {data.bottlenecks.map((bn, idx) => (
            <View key={idx} style={styles.bnCard}>
              <Text style={styles.bnTitle}>{bn.start} → {bn.end}</Text>
              <Text style={styles.bnDetail}>{bn.worst_lane} 速降 {Math.round(bn.speed_drop)} km/h，最低 {Math.round(bn.worst_speed)} km/h</Text>
            </View>
          ))}
        </View>
      )}

      {stations.length === 0 && !loading && !error && (
        <Text style={styles.emptyText}>此區間無 VD 資料</Text>
      )}

      <Text style={styles.footer}>資料來源：交通部即時路況資料交換平台</Text>
    </ScrollView>
  );
}

// =====================================================
// 樣式
// =====================================================
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.bg },
  pageTitle: { color: COLORS.white, fontSize: 22, fontWeight: '600', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },

  pickerRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  pickerBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 8, padding: 10, alignItems: 'center' },
  pickerActive: { backgroundColor: COLORS.greenBg },
  pickerText: { color: COLORS.lightGray, fontSize: 13 },
  pickerActiveText: { color: COLORS.white, fontWeight: '500' },
  dirRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  dirBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 8, padding: 8, alignItems: 'center' },
  dirActive: { backgroundColor: COLORS.greenBg },
  dirText: { color: COLORS.gray, fontSize: 13 },
  dirActiveText: { color: COLORS.white, fontWeight: '500' },
  segScroll: { marginBottom: 16 },
  segContainer: { paddingHorizontal: 16, gap: 6 },
  segBtn: { backgroundColor: COLORS.card, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  segActive: { backgroundColor: COLORS.accent },
  segText: { color: COLORS.gray, fontSize: 12 },
  segActiveText: { color: '#04342C', fontWeight: '600' },

  loadingText: { color: COLORS.gray, textAlign: 'center', padding: 40 },
  errorBox: { margin: 16, padding: 16, backgroundColor: COLORS.redBg, borderRadius: 12 },
  errorText: { color: COLORS.redText, fontSize: 14 },
  emptyText: { color: COLORS.dimGray, textAlign: 'center', padding: 40, fontSize: 14 },

  summaryRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryVal: { color: COLORS.white, fontSize: 22, fontWeight: '600' },
  summaryLabel: { color: COLORS.dimGray, fontSize: 10, marginTop: 4 },

  bandSection: { paddingHorizontal: 16, marginBottom: 16 },
  bandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bandTitle: { color: COLORS.dimGray, fontSize: 12 },
  expandBtn: { color: COLORS.accent, fontSize: 12 },
  expandBar: { backgroundColor: COLORS.card, borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 4 },
  expandBarText: { color: COLORS.accent, fontSize: 12 },
  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { color: COLORS.dimGray, fontSize: 10 },

  stationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3, gap: 8 },
  stationKm: { color: COLORS.dimGray, fontSize: 10, width: 40, textAlign: 'right' },
  laneBands: { flex: 1, flexDirection: 'row', gap: 2 },
  laneBand: { flex: 1, height: 10, borderRadius: 2 },
  stationSpeed: { color: COLORS.gray, fontSize: 10, width: 24, textAlign: 'right' },
  stationArrow: { color: COLORS.dimGray, fontSize: 8, width: 12, textAlign: 'center' },
  laneDetail: { backgroundColor: '#1a1a1e', marginHorizontal: 4, marginBottom: 6, borderRadius: 8, padding: 10 },
  laneDetailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  laneDetailDot: { width: 6, height: 6, borderRadius: 3 },
  laneDetailName: { color: COLORS.lightGray, fontSize: 11, width: 32 },
  laneDetailBar: { height: 6, borderRadius: 3, minWidth: 4 },
  laneDetailSpeed: { fontSize: 12, fontWeight: '600', width: 28, textAlign: 'right' },
  laneDetailLoc: { color: COLORS.dimGray, fontSize: 10, marginTop: 4 },

  bnSectionTitle: { color: COLORS.dimGray, fontSize: 12, marginLeft: 20, marginTop: 8, marginBottom: 8 },
  bnCard: { marginHorizontal: 16, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.red, borderRadius: 12, padding: 14, backgroundColor: 'rgba(226,75,74,0.08)' },
  bnTitle: { color: '#F09595', fontSize: 14, fontWeight: '500' },
  bnDetail: { color: COLORS.gray, fontSize: 12, marginTop: 4 },

  footer: { color: COLORS.dimGray, fontSize: 10, textAlign: 'center', padding: 20 },
});
