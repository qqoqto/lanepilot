import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Switch, RefreshControl } from 'react-native';
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

const INITIAL_ROUTES = [
  {
    id: 1, name: '上班 (平日)', enabled: true,
    from: '竹北', to: '內湖',
    road: '1', dir: 'N', km_min: 16, km_max: 99,
    pushTime: '07:20', departTime: '07:30',
  },
  {
    id: 2, name: '下班 (平日)', enabled: true,
    from: '內湖', to: '竹北',
    road: '1', dir: 'S', km_min: 16, km_max: 99,
    pushTime: '17:50', departTime: '18:00',
  },
];

function CommuteCard({ route, liveData, onToggle }) {
  const summary = liveData?.summary;
  const bottlenecks = liveData?.bottlenecks || [];
  const stations = liveData?.stations || [];

  // 路況 badge
  let statusText = '載入中...';
  let statusBg = COLORS.card;
  let statusFg = COLORS.gray;
  if (summary) {
    if (summary.bottleneck_count === 0) {
      statusText = '全線順暢';
      statusBg = COLORS.greenBg;
      statusFg = COLORS.greenText;
    } else {
      statusText = `${summary.bottleneck_count} 處瓶頸`;
      statusBg = COLORS.yellowBg;
      statusFg = COLORS.yellowText;
    }
    if (summary.avg_speed < 40) {
      statusText = '嚴重壅塞';
      statusBg = COLORS.redBg;
      statusFg = COLORS.redText;
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{route.name}</Text>
        <Switch
          value={route.enabled}
          onValueChange={onToggle}
          trackColor={{ false: '#444', true: COLORS.greenBg }}
          thumbColor={COLORS.white}
        />
      </View>

      <View style={styles.routeRow}>
        <View style={styles.routePoint}>
          <Text style={styles.pointName}>{route.from}</Text>
          <Text style={styles.pointKm}>{route.km_max}K</Text>
        </View>
        <View style={styles.routeLine} />
        <Text style={styles.routeDir}>國{route.road} {route.dir === 'N' ? '北向' : '南向'}</Text>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <Text style={styles.pointName}>{route.to}</Text>
          <Text style={styles.pointKm}>{route.km_min}K</Text>
        </View>
      </View>

      {/* 即時數據 */}
      <View style={styles.detailRow}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>推播時間</Text>
          <Text style={styles.detailVal}>{route.pushTime}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>出發時間</Text>
          <Text style={styles.detailVal}>{route.departTime}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>即時預估</Text>
          <Text style={[styles.detailVal, { color: COLORS.accent }]}>
            {summary ? `${summary.est_minutes} 分` : '...'}
          </Text>
        </View>
      </View>

      {/* 路段色帶 (最多顯示 8 站) */}
      {stations.length > 0 && (
        <View style={styles.bandRow}>
          {stations.slice(0, 8).map((station, idx) => {
            const mainLanes = station.lanes.filter(l => !l.is_shoulder);
            const avgSpd = mainLanes.length > 0
              ? mainLanes.reduce((s, l) => s + l.speed, 0) / mainLanes.length : 0;
            const c = getLaneColor(avgSpd);
            return <View key={idx} style={[styles.bandBlock, { backgroundColor: c.bar }]} />;
          })}
          {stations.length > 8 && <Text style={styles.bandMore}>+{stations.length - 8}</Text>}
        </View>
      )}

      {/* 路況 badge + 瓶頸摘要 */}
      <View style={styles.statusRow}>
        <View>
          <Text style={styles.statusLabel}>目前路況</Text>
          {bottlenecks.length > 0 && (
            <Text style={styles.bnHint}>
              {bottlenecks[0].start.split(' ')[1]} 附近 {bottlenecks[0].worst_lane} {Math.round(bottlenecks[0].worst_speed)} km/h
            </Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={[styles.statusText, { color: statusFg }]}>{statusText}</Text>
        </View>
      </View>
    </View>
  );
}

export default function CommuteScreen() {
  const [routes, setRoutes] = useState(INITIAL_ROUTES);
  const [liveDataMap, setLiveDataMap] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [pushLogs, setPushLogs] = useState([]);

  const fetchAllRoutes = useCallback(async () => {
    const newMap = {};
    for (const route of routes) {
      try {
        const resp = await fetchWithRetry(
          `${API_BASE}/api/v1/sections?road=${route.road}&dir=${route.dir}&km_min=${route.km_min}&km_max=${route.km_max}`
        );
        if (resp.ok) {
          newMap[route.id] = await resp.json();
        }
      } catch (e) { /* 靜默重試已在 fetchWithRetry 處理 */ }
    }
    setLiveDataMap(prev => Object.keys(newMap).length > 0 ? newMap : prev);

    // 生成模擬推播紀錄
    const logs = [];
    for (const route of routes) {
      const data = newMap[route.id];
      if (data?.summary && data?.bottlenecks?.length > 0) {
        const bn = data.bottlenecks[0];
        logs.push({
          time: route.pushTime,
          route: route.name,
          msg: `${bn.start.split(' ')[1] || ''} ${bn.worst_lane} 車速 ${Math.round(bn.worst_speed)} km/h，預估全程 ${data.summary.est_minutes} 分鐘。`,
        });
      } else if (data?.summary) {
        logs.push({
          time: route.pushTime,
          route: route.name,
          msg: `全線順暢，均速 ${data.summary.avg_speed} km/h，預估 ${data.summary.est_minutes} 分鐘。`,
        });
      }
    }
    setPushLogs(logs);
    setRefreshing(false);
  }, [routes]);

  useEffect(() => {
    fetchAllRoutes();
    const interval = setInterval(fetchAllRoutes, 60000);
    return () => clearInterval(interval);
  }, [fetchAllRoutes]);

  const toggleRoute = (id) => {
    setRoutes(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  return (
    <ScrollView
      style={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAllRoutes(); }} tintColor={COLORS.green} />}
    >
      <Text style={styles.pageTitle}>我的通勤</Text>
      <Text style={styles.pageSub}>即時路況每 60 秒自動更新</Text>

      {routes.map(route => (
        <CommuteCard
          key={route.id}
          route={route}
          liveData={liveDataMap[route.id]}
          onToggle={() => toggleRoute(route.id)}
        />
      ))}

      {/* 推播紀錄 (根據真實資料生成) */}
      {pushLogs.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>推播預覽 (基於即時路況)</Text>
          {pushLogs.map((log, idx) => (
            <View key={idx} style={styles.pushCard}>
              <Text style={styles.pushTime}>{log.time}</Text>
              <View style={styles.pushContent}>
                <Text style={styles.pushMsg}>{log.msg}</Text>
                <Text style={styles.pushMeta}>{log.route}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.footer}>即時路況每 60 秒自動更新</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.bg },
  pageTitle: { color: COLORS.white, fontSize: 22, fontWeight: '600', paddingHorizontal: 20, paddingTop: 20 },
  pageSub: { color: COLORS.dimGray, fontSize: 13, paddingHorizontal: 20, paddingBottom: 16 },
  card: { marginHorizontal: 16, marginBottom: 12, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingBottom: 10 },
  cardName: { color: COLORS.white, fontSize: 15, fontWeight: '500' },
  routeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  routePoint: { alignItems: 'center' },
  pointName: { color: COLORS.lightGray, fontSize: 12 },
  pointKm: { color: COLORS.accent, fontSize: 11, marginTop: 1 },
  routeLine: { flex: 1, height: 1, backgroundColor: '#444' },
  routeDir: { color: COLORS.dimGray, fontSize: 11 },
  detailRow: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: COLORS.border, paddingVertical: 10, paddingHorizontal: 14, gap: 16 },
  detailItem: { flex: 1 },
  detailLabel: { color: COLORS.dimGray, fontSize: 10 },
  detailVal: { color: COLORS.lightGray, fontSize: 14, fontWeight: '500', marginTop: 2 },
  bandRow: { flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 10, gap: 2, alignItems: 'center' },
  bandBlock: { flex: 1, height: 8, borderRadius: 2 },
  bandMore: { color: COLORS.dimGray, fontSize: 9, marginLeft: 4 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 0.5, borderTopColor: COLORS.border, padding: 12, paddingHorizontal: 14 },
  statusLabel: { color: COLORS.gray, fontSize: 12 },
  bnHint: { color: COLORS.dimGray, fontSize: 10, marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '500' },
  sectionTitle: { color: COLORS.dimGray, fontSize: 12, marginLeft: 20, marginTop: 16, marginBottom: 8 },
  pushCard: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: COLORS.card, borderRadius: 10, padding: 12, gap: 10 },
  pushTime: { color: COLORS.dimGray, fontSize: 12, minWidth: 40, paddingTop: 1 },
  pushContent: { flex: 1 },
  pushMsg: { color: COLORS.lightGray, fontSize: 12, lineHeight: 18 },
  pushMeta: { color: COLORS.dimGray, fontSize: 10, marginTop: 4 },
  footer: { color: COLORS.dimGray, fontSize: 10, textAlign: 'center', padding: 20 },
});
