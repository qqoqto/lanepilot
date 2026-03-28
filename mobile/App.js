import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, RefreshControl, StatusBar } from 'react-native';

// API 設定 - 開發時用 localhost, 部署後改成 Railway URL
const API_BASE = 'http://localhost:8000';

// 色彩常數
const COLORS = {
  bg: '#111114',
  card: '#1e1e22',
  border: '#2a2a2e',
  green: '#1D9E75',
  greenBg: '#0F6E56',
  greenText: '#9FE1CB',
  yellow: '#BA7517',
  yellowBg: '#633806',
  yellowText: '#FAC775',
  red: '#E24B4A',
  redBg: '#791F1F',
  redText: '#F7C1C1',
  white: '#ffffff',
  gray: '#888888',
  dimGray: '#666666',
  lightGray: '#cccccc',
};

function getLaneColor(speed) {
  if (speed > 80) return { bg: COLORS.greenBg, text: COLORS.greenText, bar: COLORS.green };
  if (speed >= 40) return { bg: COLORS.yellowBg, text: COLORS.yellowText, bar: COLORS.yellow };
  return { bg: COLORS.redBg, text: COLORS.redText, bar: COLORS.red };
}

function getConfidenceColor(confidence) {
  if (confidence === '高') return COLORS.green;
  if (confidence === '中') return COLORS.yellow;
  return COLORS.dimGray;
}

function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  return `${Math.floor(diff / 3600)} 小時前`;
}

// ========== 車道卡片元件 ==========
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

// ========== 建議條元件 ==========
function AdviceBar({ advice }) {
  if (!advice) return null;
  const isSwitch = advice.speed_diff >= 15;
  const bgColor = isSwitch ? COLORS.green : COLORS.card;
  return (
    <View style={[styles.adviceBar, { backgroundColor: bgColor }]}>
      <Text style={styles.adviceAction}>{advice.action}</Text>
      <Text style={styles.adviceDetail}>{advice.message}</Text>
      {advice.shoulder_note ? (
        <Text style={styles.shoulderNote}>{advice.shoulder_note}</Text>
      ) : null}
    </View>
  );
}

// ========== 前方路段預覽元件 ==========
function SectionPreview({ stations }) {
  if (!stations || stations.length === 0) return null;
  // 只顯示前 3 個站
  const preview = stations.slice(0, 3);
  return (
    <View>
      <Text style={styles.sectionTitle}>前方路段預覽</Text>
      {preview.map((station, idx) => (
        <View key={idx} style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionName}>{station.location}</Text>
            <Text style={styles.sectionKm}>{station.mileage}K</Text>
          </View>
          <View style={styles.miniLanes}>
            {station.lanes.filter(l => !l.is_shoulder).map((lane, i) => {
              const c = getLaneColor(lane.speed);
              return <View key={i} style={[styles.miniLane, { backgroundColor: c.bar }]} />;
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

// ========== 瓶頸提示元件 ==========
function BottleneckAlert({ bottlenecks }) {
  if (!bottlenecks || bottlenecks.length === 0) return null;
  return (
    <View>
      <Text style={styles.sectionTitle}>瓶頸警報</Text>
      {bottlenecks.map((bn, idx) => (
        <View key={idx} style={styles.bottleneckCard}>
          <Text style={styles.bnTitle}>{bn.start} → {bn.end}</Text>
          <Text style={styles.bnDetail}>
            {bn.worst_lane} 速降 {Math.round(bn.speed_drop)} km/h → {Math.round(bn.worst_speed)} km/h
          </Text>
        </View>
      ))}
    </View>
  );
}

// ========== 主畫面 ==========
export default function App() {
  const [data, setData] = useState(null);
  const [sectionData, setSectionData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  // 目前查詢的位置 (預設新竹周邊)
  const [road] = useState('1');
  const [dir] = useState('N');
  const [km] = useState(88);  // 88K 附近

  const fetchData = useCallback(async () => {
    try {
      // 抓最近 VD 站
      const resp = await fetch(`${API_BASE}/api/v1/lanes/realtime?road=${road}&dir=${dir}&km=${km}`);
      if (resp.ok) {
        const json = await resp.json();
        setData(json);
        setLastUpdate(new Date().toISOString());
        setError(null);
      } else {
        const errJson = await resp.json().catch(() => ({}));
        setError(errJson.detail || `HTTP ${resp.status}`);
      }

      // 抓路段總覽 (含瓶頸)
      const sectResp = await fetch(`${API_BASE}/api/v1/sections?road=${road}&dir=${dir}&km_min=60&km_max=100`);
      if (sectResp.ok) {
        const sectJson = await sectResp.json();
        setSectionData(sectJson);
      }
    } catch (e) {
      setError(`連線失敗: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [road, dir, km]);

  // 初始載入 + 每 30 秒自動刷新
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // 找出最快車道
  const bestLane = data?.lanes?.reduce((best, lane) =>
    (!lane.is_shoulder && lane.speed > (best?.speed || 0)) ? lane : best, null);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.green} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>國{road} {dir === 'N' ? '北向' : '南向'}</Text>
            <Text style={styles.headerSub}>{data?.location || '載入中...'} | {km}K</Text>
          </View>
          <Text style={styles.updateText}>
            {lastUpdate ? timeAgo(lastUpdate) + '更新' : ''}
          </Text>
        </View>

        {/* 錯誤/載入狀態 */}
        {loading && <Text style={styles.loadingText}>正在載入即時資料...</Text>}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorHint}>請確認後端 API 正在執行 (port 8000)</Text>
          </View>
        )}

        {/* 建議條 */}
        {data?.advice && <AdviceBar advice={data.advice} />}

        {/* 車道速度卡片 */}
        {data?.lanes && (
          <View>
            <Text style={styles.sectionLabel}>各車道即時速度</Text>
            <View style={styles.lanesGrid}>
              {data.lanes.map((lane, idx) => (
                <LaneCard
                  key={idx}
                  lane={lane}
                  isBest={bestLane && lane.name === bestLane.name && !lane.is_shoulder}
                />
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
        {sectionData?.bottlenecks && <BottleneckAlert bottlenecks={sectionData.bottlenecks} />}

        {/* 前方路段預覽 */}
        {sectionData?.stations && (
          <SectionPreview stations={sectionData.stations.filter(s => s.mileage < km).slice(0, 3)} />
        )}

        {/* 底部資訊 */}
        <Text style={styles.footer}>資料來源：交通部高速公路局「交通資料庫」</Text>
      </ScrollView>

      {/* 底部 Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem}>
          <View style={[styles.tabDot, { backgroundColor: COLORS.green }]} />
          <Text style={[styles.tabText, { color: COLORS.green }]}>即時</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabText}>路段</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabText}>通勤</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabText}>設定</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ========== 樣式 ==========
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
  headerTitle: { color: COLORS.white, fontSize: 22, fontWeight: '600' },
  headerSub: { color: COLORS.gray, fontSize: 13, marginTop: 2 },
  updateText: { color: COLORS.dimGray, fontSize: 12 },

  // Loading / Error
  loadingText: { color: COLORS.gray, textAlign: 'center', padding: 40, fontSize: 15 },
  errorBox: { margin: 16, padding: 16, backgroundColor: COLORS.redBg, borderRadius: 12 },
  errorText: { color: COLORS.redText, fontSize: 14, fontWeight: '500' },
  errorHint: { color: COLORS.redText, fontSize: 12, marginTop: 4, opacity: 0.7 },

  // Advice
  adviceBar: { marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 14 },
  adviceAction: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  adviceDetail: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  shoulderNote: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 6, fontStyle: 'italic' },

  // Lanes
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

  // Summary
  summaryRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 20 },
  summaryCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryVal: { color: COLORS.white, fontSize: 24, fontWeight: '600' },
  summaryLabel: { color: COLORS.dimGray, fontSize: 11, marginTop: 4 },

  // Bottleneck
  bottleneckCard: { marginHorizontal: 16, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.red, borderRadius: 12, padding: 14, backgroundColor: 'rgba(226,75,74,0.08)' },
  bnTitle: { color: '#F09595', fontSize: 14, fontWeight: '500' },
  bnDetail: { color: COLORS.gray, fontSize: 12, marginTop: 4 },

  // Section preview
  sectionTitle: { color: COLORS.dimGray, fontSize: 12, marginLeft: 20, marginTop: 20, marginBottom: 8 },
  sectionCard: { marginHorizontal: 16, marginBottom: 8, backgroundColor: COLORS.card, borderRadius: 12, padding: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sectionName: { color: COLORS.lightGray, fontSize: 13, fontWeight: '500' },
  sectionKm: { color: COLORS.dimGray, fontSize: 12 },
  miniLanes: { flexDirection: 'row', gap: 3 },
  miniLane: { flex: 1, height: 6, borderRadius: 3 },

  // Footer
  footer: { color: COLORS.dimGray, fontSize: 10, textAlign: 'center', padding: 20, paddingBottom: 8 },

  // Tab Bar
  tabBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: COLORS.border, backgroundColor: COLORS.bg },
  tabItem: { alignItems: 'center' },
  tabDot: { width: 4, height: 4, borderRadius: 2, marginBottom: 4 },
  tabText: { color: COLORS.dimGray, fontSize: 11 },
});
