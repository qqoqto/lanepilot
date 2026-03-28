import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { API_BASE, COLORS, getLaneColor } from '../constants';

const ROADS = [
  { label: '國1', value: '1' },
  { label: '國3', value: '3' },
  { label: '國1高架', value: '1H' },
];

export default function SectionsScreen() {
  const [road, setRoad] = useState('1');
  const [dir, setDir] = useState('N');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/v1/sections?road=${road}&dir=${dir}&km_min=60&km_max=100`);
      if (resp.ok) {
        setData(await resp.json());
      }
    } catch (e) { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [road, dir]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

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
            onPress={() => setRoad(r.value)}>
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

      {loading && <Text style={styles.loadingText}>載入中...</Text>}

      {/* 摘要卡片 */}
      {data?.summary && (
        <View style={styles.summaryRow}>
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
            <Text style={styles.summaryLabel}>km/h 均速</Text>
          </View>
        </View>
      )}

      {/* 多車道色帶 */}
      {data?.stations && (
        <View style={styles.bandSection}>
          <Text style={styles.bandTitle}>各車道速度色帶</Text>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.green }]} /><Text style={styles.legendText}>順暢 &gt;80</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.yellow }]} /><Text style={styles.legendText}>車多 40-80</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.red }]} /><Text style={styles.legendText}>壅塞 &lt;40</Text></View>
          </View>
          {data.stations.map((station, idx) => (
            <View key={idx} style={styles.stationRow}>
              <Text style={styles.stationKm}>{station.mileage}K</Text>
              <View style={styles.laneBands}>
                {station.lanes.filter(l => !l.is_shoulder).map((lane, i) => {
                  const c = getLaneColor(lane.speed);
                  return <View key={i} style={[styles.laneBand, { backgroundColor: c.bar }]} />;
                })}
              </View>
              <Text style={styles.stationSpeed}>{Math.round(station.lanes.filter(l => !l.is_shoulder).reduce((s, l) => s + l.speed, 0) / station.lanes.filter(l => !l.is_shoulder).length)}</Text>
            </View>
          ))}
        </View>
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
  dirRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  dirBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 8, padding: 8, alignItems: 'center' },
  dirActive: { backgroundColor: COLORS.greenBg },
  dirText: { color: COLORS.gray, fontSize: 13 },
  dirActiveText: { color: COLORS.white, fontWeight: '500' },
  loadingText: { color: COLORS.gray, textAlign: 'center', padding: 40 },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryVal: { color: COLORS.white, fontSize: 24, fontWeight: '600' },
  summaryLabel: { color: COLORS.dimGray, fontSize: 11, marginTop: 4 },
  bandSection: { paddingHorizontal: 16, marginBottom: 16 },
  bandTitle: { color: COLORS.dimGray, fontSize: 12, marginBottom: 8 },
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
