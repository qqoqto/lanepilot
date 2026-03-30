import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { API_BASE, COLORS, getLaneColor } from '../constants';

const ROADS = [
  { label: '國1', value: '1' },
  { label: '國3', value: '3' },
  { label: '國1高架', value: '1H' },
];

// 各國道的常用路段區間
const SEGMENTS = {
  '1': [
    { label: '基隆-汐止', km_min: 0, km_max: 15 },
    { label: '汐止-林口', km_min: 15, km_max: 42 },
    { label: '林口-中壢', km_min: 42, km_max: 62 },
    { label: '中壢-新竹', km_min: 62, km_max: 100 },
    { label: '新竹-苗栗', km_min: 100, km_max: 132 },
    { label: '苗栗-台中', km_min: 132, km_max: 178 },
    { label: '台中-彰化', km_min: 178, km_max: 198 },
    { label: '彰化-雲林', km_min: 198, km_max: 240 },
    { label: '雲林-嘉義', km_min: 240, km_max: 272 },
    { label: '嘉義-台南', km_min: 272, km_max: 315 },
    { label: '台南-高雄', km_min: 315, km_max: 357 },
    { label: '全線', km_min: 0, km_max: 999 },
  ],
  '3': [
    { label: '基金-木柵', km_min: 0, km_max: 27 },
    { label: '木柵-鶯歌', km_min: 27, km_max: 50 },
    { label: '鶯歌-龍潭', km_min: 50, km_max: 67 },
    { label: '龍潭-竹林', km_min: 67, km_max: 100 },
    { label: '竹林-苗栗', km_min: 100, km_max: 140 },
    { label: '苗栗-沙鹿', km_min: 140, km_max: 176 },
    { label: '沙鹿-彰化', km_min: 176, km_max: 210 },
    { label: '彰化-南投', km_min: 210, km_max: 243 },
    { label: '南投-雲林', km_min: 243, km_max: 280 },
    { label: '雲林-嘉義', km_min: 280, km_max: 310 },
    { label: '嘉義-善化', km_min: 310, km_max: 340 },
    { label: '善化-高雄', km_min: 340, km_max: 400 },
    { label: '全線', km_min: 0, km_max: 999 },
  ],
  '1H': [
    { label: '汐止-堤頂', km_min: 15, km_max: 30 },
    { label: '全線', km_min: 0, km_max: 999 },
  ],
};

// 各國道預設選擇的路段 index
const DEFAULT_SEG = { '1': 3, '3': 3, '1H': 0 };  // 國1預設中壢-新竹

const PREVIEW_COUNT = 10;

function BandSection({ stations }) {
  const [expanded, setExpanded] = useState(false);
  const total = stations.length;
  const showStations = expanded ? stations : stations.slice(0, PREVIEW_COUNT);
  const hasMore = total > PREVIEW_COUNT;

  return (
    <View style={styles.bandSection}>
      <View style={styles.bandHeader}>
        <Text style={styles.bandTitle}>各車道速度色帶 ({total} 站)</Text>
        {hasMore && (
          <TouchableOpacity onPress={() => setExpanded(!expanded)}>
            <Text style={styles.expandBtn}>{expanded ? '收合' : `展開全部`}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.green }]} /><Text style={styles.legendText}>順暢 &gt;80</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.yellow }]} /><Text style={styles.legendText}>車多 40-80</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.red }]} /><Text style={styles.legendText}>壅塞 &lt;40</Text></View>
      </View>
      {showStations.map((station, idx) => {
        const mainLanes = station.lanes.filter(l => !l.is_shoulder);
        const avgSpeed = mainLanes.length > 0
          ? Math.round(mainLanes.reduce((s, l) => s + l.speed, 0) / mainLanes.length) : 0;
        return (
          <View key={idx} style={styles.stationRow}>
            <Text style={styles.stationKm}>{station.mileage}K</Text>
            <View style={styles.laneBands}>
              {mainLanes.map((lane, i) => {
                const c = getLaneColor(lane.speed);
                return <View key={i} style={[styles.laneBand, { backgroundColor: c.bar }]} />;
              })}
            </View>
            <Text style={styles.stationSpeed}>{avgSpeed}</Text>
          </View>
        );
      })}
      {hasMore && !expanded && (
        <TouchableOpacity style={styles.expandBar} onPress={() => setExpanded(true)}>
          <Text style={styles.expandBarText}>還有 {total - PREVIEW_COUNT} 站，點擊展開</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function SectionsScreen() {
  const [road, setRoad] = useState('1');
  const [dir, setDir] = useState('N');
  const [segIdx, setSegIdx] = useState(DEFAULT_SEG['1']);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const segments = SEGMENTS[road] || [];
  const seg = segments[segIdx] || segments[0];

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const resp = await fetch(
        `${API_BASE}/api/v1/sections?road=${road}&dir=${dir}&km_min=${seg.km_min}&km_max=${seg.km_max}`
      );
      if (resp.ok) {
        const json = await resp.json();
        setData(json);
        setError(null);
      } else {
        const err = await resp.json().catch(() => ({}));
        setError(err.detail || `HTTP ${resp.status}`);
      }
    } catch (e) {
      // 切換時前一個 request 被取消是正常的，不顯示錯誤
      if (e.name === 'AbortError') return;
      // 如果已有資料，不用顯示短暫的連線錯誤
      if (!data) {
        setError(`連線失敗: ${e.message}`);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [road, dir, seg.km_min, seg.km_max]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchData();
  }, [fetchData]);

  // 切換國道時重置路段選擇
  const switchRoad = (newRoad) => {
    setError(null);
    setRoad(newRoad);
    setSegIdx(DEFAULT_SEG[newRoad] || 0);
  };

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

      {/* 方向切換 */}
      <View style={styles.dirRow}>
        <TouchableOpacity style={[styles.dirBtn, dir === 'N' && styles.dirActive]} onPress={() => setDir('N')}>
          <Text style={[styles.dirText, dir === 'N' && styles.dirActiveText]}>北向</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.dirBtn, dir === 'S' && styles.dirActive]} onPress={() => setDir('S')}>
          <Text style={[styles.dirText, dir === 'S' && styles.dirActiveText]}>南向</Text>
        </TouchableOpacity>
      </View>

      {/* 路段區間選擇 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.segScroll} contentContainerStyle={styles.segContainer}>
        {segments.map((s, idx) => (
          <TouchableOpacity key={idx} style={[styles.segBtn, segIdx === idx && styles.segActive]}
            onPress={() => setSegIdx(idx)}>
            <Text style={[styles.segText, segIdx === idx && styles.segActiveText]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && <Text style={styles.loadingText}>載入中...</Text>}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* 摘要卡片 */}
      {data?.summary && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryVal}>{data.summary.station_count}</Text>
            <Text style={styles.summaryLabel}>VD 站數</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryVal}>{data.summary.est_minutes}</Text>
            <Text style={styles.summaryLabel}>分鐘預估</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryVal, { color: data.summary.bottleneck_count > 0 ? COLORS.yellow : COLORS.green }]}>
              {data.summary.bottleneck_count}
            </Text>
            <Text style={styles.summaryLabel}>處瓶頸</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryVal}>{data.summary.avg_speed}</Text>
            <Text style={styles.summaryLabel}>km/h</Text>
          </View>
        </View>
      )}

      {/* 多車道色帶 (可收合) */}
      {data?.stations && (
        <BandSection stations={data.stations} />
      )}

      {/* 瓶頸列表 */}
      {data?.bottlenecks?.length > 0 && (
        <View>
          <Text style={styles.bnSectionTitle}>瓶頸路段</Text>
          {data.bottlenecks.map((bn, idx) => (
            <View key={idx} style={styles.bnCard}>
              <Text style={styles.bnTitle}>{bn.start} → {bn.end}</Text>
              <Text style={styles.bnDetail}>{bn.worst_lane} 速降 {Math.round(bn.speed_drop)} km/h，目前 {Math.round(bn.worst_speed)} km/h</Text>
            </View>
          ))}
        </View>
      )}

      {data?.stations?.length === 0 && !loading && !error && (
        <Text style={styles.emptyText}>此路段目前無 VD 資料</Text>
      )}

      <Text style={styles.footer}>資料來源：交通部高速公路局「交通資料庫」</Text>
    </ScrollView>
  );
}

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
  stationSpeed: { color: COLORS.gray, fontSize: 10, width: 28, textAlign: 'right' },
  bnSectionTitle: { color: COLORS.dimGray, fontSize: 12, marginLeft: 20, marginTop: 8, marginBottom: 8 },
  bnCard: { marginHorizontal: 16, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.red, borderRadius: 12, padding: 14, backgroundColor: 'rgba(226,75,74,0.08)' },
  bnTitle: { color: '#F09595', fontSize: 14, fontWeight: '500' },
  bnDetail: { color: COLORS.gray, fontSize: 12, marginTop: 4 },
  footer: { color: COLORS.dimGray, fontSize: 10, textAlign: 'center', padding: 20 },
});
