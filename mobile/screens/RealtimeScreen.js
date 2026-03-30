import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { API_BASE, COLORS, getLaneColor, timeAgo } from '../constants';
import { useSettings } from '../SettingsContext';

const ROADS = [
  { label: '國1', value: '1' },
  { label: '國3', value: '3' },
  { label: '國1高架', value: '1H' },
];

// 各國道的常用里程點 (交流道位置)
const KM_POINTS = {
  '1': [
    { label: '基隆', km: 3 },
    { label: '汐止', km: 12 },
    { label: '五股', km: 29 },
    { label: '林口', km: 41 },
    { label: '桃園', km: 52 },
    { label: '中壢', km: 62 },
    { label: '楊梅', km: 69 },
    { label: '湖口', km: 85 },
    { label: '竹北', km: 91 },
    { label: '新竹', km: 95 },
    { label: '頭份', km: 110 },
    { label: '苗栗', km: 132 },
    { label: '后里', km: 157 },
    { label: '台中', km: 178 },
    { label: '彰化', km: 198 },
    { label: '斗南', km: 240 },
    { label: '嘉義', km: 272 },
    { label: '新營', km: 295 },
    { label: '台南', km: 315 },
    { label: '岡山', km: 340 },
    { label: '高雄', km: 357 },
  ],
  '3': [
    { label: '基金', km: 3 },
    { label: '木柵', km: 27 },
    { label: '三鶯', km: 50 },
    { label: '龍潭', km: 67 },
    { label: '關西', km: 79 },
    { label: '竹林', km: 100 },
    { label: '苗栗', km: 140 },
    { label: '沙鹿', km: 176 },
    { label: '彰化', km: 210 },
    { label: '南投', km: 243 },
    { label: '斗六', km: 280 },
    { label: '梅山', km: 300 },
    { label: '善化', km: 340 },
    { label: '關廟', km: 360 },
    { label: '高雄', km: 400 },
  ],
  '1H': [
    { label: '汐止', km: 15 },
    { label: '堤頂', km: 21 },
    { label: '環北', km: 26 },
    { label: '中和', km: 30 },
  ],
};

const DEFAULT_KM_IDX = { '1': 7, '3': 4, '1H': 1 }; // 國1預設湖口, 國3預設關西, 國1H預設堤頂

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

function AdviceBar({ advice, threshold }) {
  if (!advice) return null;
  const diff = advice.speed_diff;
  const isStrong = diff >= 30;
  const isMedium = diff >= threshold && diff < 30;
  const isHold = diff < threshold;

  let action, message, bgColor, borderColor, iconText;
  if (isHold) {
    action = '維持目前車道';
    message = advice.message;
    bgColor = COLORS.card;
    borderColor = COLORS.border;
    iconText = '→';
  } else if (isStrong) {
    action = `立即切至${advice.best_lane}車道`;
    message = advice.message;
    bgColor = '#0B5E3F';
    borderColor = COLORS.green;
    iconText = '⚡';
  } else {
    action = `可切至${advice.best_lane}車道`;
    message = advice.message;
    bgColor = '#1A4A35';
    borderColor = COLORS.green;
    iconText = '↗';
  }

  return (
    <View style={[styles.adviceBar, { backgroundColor: bgColor, borderLeftWidth: 4, borderLeftColor: borderColor }]}>
      <View style={styles.adviceRow}>
        <Text style={[styles.adviceIcon, isStrong && styles.adviceIconStrong]}>{iconText}</Text>
        <View style={styles.adviceContent}>
          <Text style={[styles.adviceAction, isStrong && styles.adviceActionStrong]}>{action}</Text>
          <Text style={styles.adviceDetail}>{message}</Text>
        </View>
      </View>
      {isStrong && (
        <View style={styles.urgentBadge}>
          <Text style={styles.urgentText}>速差 {Math.round(diff)} km/h</Text>
        </View>
      )}
      <Text style={styles.thresholdHint}>靈敏度: {threshold} km/h</Text>
      {advice.shoulder_note ? <Text style={styles.shoulderNote}>{advice.shoulder_note}</Text> : null}
    </View>
  );
}

export default function RealtimeScreen() {
  const { sensitivity } = useSettings();
  const [road, setRoad] = useState('1');
  const [dir, setDir] = useState('N');
  const [kmIdx, setKmIdx] = useState(DEFAULT_KM_IDX['1']);
  const [data, setData] = useState(null);
  const [sectionData, setSectionData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const kmPoints = KM_POINTS[road] || [];
  const currentPoint = kmPoints[kmIdx] || kmPoints[0];
  const km = currentPoint?.km || 88;

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      // 抓最近 VD 站
      const resp = await fetch(`${API_BASE}/api/v1/lanes/realtime?road=${road}&dir=${dir}&km=${km}`);
      if (resp.ok) {
        const json = await resp.json();
        setData(json);
        setLastUpdate(new Date().toISOString());
      } else {
        const err = await resp.json().catch(() => ({}));
        if (!data) setError(err.detail || `HTTP ${resp.status}`);
      }

      // 抓附近路段摘要 (前後 20K)
      const sectResp = await fetch(`${API_BASE}/api/v1/sections?road=${road}&dir=${dir}&km_min=${Math.max(0, km - 20)}&km_max=${km + 20}`);
      if (sectResp.ok) {
        setSectionData(await sectResp.json());
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (!data) setError(`連線失敗: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [road, dir, km]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const switchRoad = (newRoad) => {
    setError(null);
    setRoad(newRoad);
    setKmIdx(DEFAULT_KM_IDX[newRoad] || 0);
  };

  const bestLane = data?.lanes?.reduce((best, lane) =>
    (!lane.is_shoulder && lane.speed > (best?.speed || 0)) ? lane : best, null);

  return (
    <ScrollView
      style={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={COLORS.green} />}
    >
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
        <TouchableOpacity style={[styles.dirBtn, dir === 'N' && styles.dirActive]} onPress={() => { setError(null); setDir('N'); }}>
          <Text style={[styles.dirText, dir === 'N' && styles.dirActiveText]}>北向</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.dirBtn, dir === 'S' && styles.dirActive]} onPress={() => { setError(null); setDir('S'); }}>
          <Text style={[styles.dirText, dir === 'S' && styles.dirActiveText]}>南向</Text>
        </TouchableOpacity>
      </View>

      {/* 里程點選擇 (橫向滑動) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kmScroll} contentContainerStyle={styles.kmContainer}>
        {kmPoints.map((pt, idx) => (
          <TouchableOpacity key={idx} style={[styles.kmBtn, kmIdx === idx && styles.kmActive]}
            onPress={() => { setError(null); setKmIdx(idx); }}>
            <Text style={[styles.kmText, kmIdx === idx && styles.kmActiveText]}>{pt.label}</Text>
            <Text style={[styles.kmSub, kmIdx === idx && styles.kmActiveSub]}>{pt.km}K</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>國{road} {dir === 'N' ? '北向' : '南向'} {currentPoint?.label}</Text>
          <Text style={styles.headerSub}>{data?.location || '載入中...'} | {km}K 附近</Text>
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

      {/* 建議條 */}
      {data?.advice && <AdviceBar advice={data.advice} threshold={sensitivity} />}

      {/* 車道速度卡片 */}
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

      {/* 路段摘要 */}
      {sectionData?.summary && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryVal}>{sectionData.summary.est_minutes}</Text>
            <Text style={styles.summaryLabel}>分鐘預估</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryVal, { color: sectionData.summary.bottleneck_count > 0 ? COLORS.yellow : COLORS.green }]}>
              {sectionData.summary.bottleneck_count}
            </Text>
            <Text style={styles.summaryLabel}>處瓶頸</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryVal}>{sectionData.summary.avg_speed}</Text>
            <Text style={styles.summaryLabel}>km/h 均速</Text>
          </View>
        </View>
      )}

      {/* 瓶頸警報 */}
      {sectionData?.bottlenecks?.length > 0 && (
        <View>
          <Text style={styles.bnTitle}>附近瓶頸</Text>
          {sectionData.bottlenecks.map((bn, idx) => (
            <View key={idx} style={styles.bnCard}>
              <Text style={styles.bnText}>{bn.start} → {bn.end}</Text>
              <Text style={styles.bnDetail}>{bn.worst_lane} 速降 {Math.round(bn.speed_drop)} km/h → {Math.round(bn.worst_speed)} km/h</Text>
            </View>
          ))}
        </View>
      )}

      {/* 前方路段色帶 */}
      {sectionData?.stations?.length > 0 && (
        <View style={styles.bandSection}>
          <Text style={styles.bandTitle}>前方路段 ({sectionData.stations.length} 站)</Text>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.green }]} /><Text style={styles.legendText}>順暢</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.yellow }]} /><Text style={styles.legendText}>車多</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.red }]} /><Text style={styles.legendText}>壅塞</Text></View>
          </View>
          {sectionData.stations.map((station, idx) => {
            const mainLanes = station.lanes.filter(l => !l.is_shoulder);
            const avgSpd = mainLanes.length > 0
              ? Math.round(mainLanes.reduce((s, l) => s + l.speed, 0) / mainLanes.length) : 0;
            return (
              <View key={idx} style={styles.bandRow}>
                <Text style={styles.bandKm}>{station.mileage}K</Text>
                <View style={styles.bandLanes}>
                  {mainLanes.map((lane, i) => {
                    const c = getLaneColor(lane.speed);
                    return <View key={i} style={[styles.bandLane, { backgroundColor: c.bar }]} />;
                  })}
                </View>
                <Text style={styles.bandSpeed}>{avgSpd}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.footer}>每 30 秒自動刷新 | 下拉手動刷新</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.bg },
  pickerRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingTop: 16, marginBottom: 8 },
  pickerBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 8, padding: 10, alignItems: 'center' },
  pickerActive: { backgroundColor: COLORS.greenBg },
  pickerText: { color: COLORS.lightGray, fontSize: 13 },
  pickerActiveText: { color: COLORS.white, fontWeight: '500' },
  dirRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  dirBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 8, padding: 8, alignItems: 'center' },
  dirActive: { backgroundColor: COLORS.greenBg },
  dirText: { color: COLORS.gray, fontSize: 13 },
  dirActiveText: { color: COLORS.white, fontWeight: '500' },
  kmScroll: { marginBottom: 12 },
  kmContainer: { paddingHorizontal: 16, gap: 6 },
  kmBtn: { backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  kmActive: { backgroundColor: COLORS.accent },
  kmText: { color: COLORS.gray, fontSize: 12, fontWeight: '500' },
  kmActiveText: { color: '#04342C', fontWeight: '600' },
  kmSub: { color: COLORS.dimGray, fontSize: 9, marginTop: 1 },
  kmActiveSub: { color: '#04342C', opacity: 0.7 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { color: COLORS.white, fontSize: 20, fontWeight: '600' },
  headerSub: { color: COLORS.gray, fontSize: 13, marginTop: 2 },
  updateText: { color: COLORS.dimGray, fontSize: 12 },
  loadingText: { color: COLORS.gray, textAlign: 'center', padding: 40, fontSize: 15 },
  errorBox: { margin: 16, padding: 16, backgroundColor: COLORS.redBg, borderRadius: 12 },
  errorText: { color: COLORS.redText, fontSize: 14, fontWeight: '500' },
  errorHint: { color: COLORS.redText, fontSize: 12, marginTop: 4, opacity: 0.7 },
  adviceBar: { marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 14 },
  adviceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  adviceIcon: { fontSize: 20, color: COLORS.dimGray, width: 28, textAlign: 'center', paddingTop: 2 },
  adviceIconStrong: { fontSize: 24, color: COLORS.green },
  adviceContent: { flex: 1 },
  adviceAction: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  adviceActionStrong: { fontSize: 18, color: '#5DFFC1' },
  adviceDetail: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  urgentBadge: { backgroundColor: COLORS.green, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 8 },
  urgentText: { color: '#04342C', fontSize: 12, fontWeight: '700' },
  shoulderNote: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  thresholdHint: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 4 },
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
  summaryRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 20 },
  summaryCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryVal: { color: COLORS.white, fontSize: 24, fontWeight: '600' },
  summaryLabel: { color: COLORS.dimGray, fontSize: 11, marginTop: 4 },
  bnTitle: { color: COLORS.dimGray, fontSize: 12, marginLeft: 20, marginTop: 16, marginBottom: 8 },
  bnCard: { marginHorizontal: 16, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.red, borderRadius: 12, padding: 14, backgroundColor: 'rgba(226,75,74,0.08)' },
  bnText: { color: '#F09595', fontSize: 14, fontWeight: '500' },
  bnDetail: { color: COLORS.gray, fontSize: 12, marginTop: 4 },
  bandSection: { paddingHorizontal: 16, marginTop: 16 },
  bandTitle: { color: COLORS.dimGray, fontSize: 12, marginBottom: 8 },
  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { color: COLORS.dimGray, fontSize: 10 },
  bandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3, gap: 8 },
  bandKm: { color: COLORS.dimGray, fontSize: 10, width: 40, textAlign: 'right' },
  bandLanes: { flex: 1, flexDirection: 'row', gap: 2 },
  bandLane: { flex: 1, height: 10, borderRadius: 2 },
  bandSpeed: { color: COLORS.gray, fontSize: 10, width: 28, textAlign: 'right' },
  footer: { color: COLORS.dimGray, fontSize: 10, textAlign: 'center', padding: 20 },
});
