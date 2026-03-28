import { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { COLORS } from '../constants';

const DEMO_ROUTES = [
  {
    id: 1, name: '上班 (平日)', enabled: true,
    from: '竹北', fromKm: '99K', to: '內湖', toKm: '16K',
    road: '國1', dir: '北向',
    pushTime: '07:20', departTime: '07:30', avgMin: 52,
    status: '1 處瓶頸', statusColor: COLORS.yellow,
  },
  {
    id: 2, name: '下班 (平日)', enabled: true,
    from: '內湖', fromKm: '16K', to: '竹北', toKm: '99K',
    road: '國1', dir: '南向',
    pushTime: '17:50', departTime: '18:00', avgMin: 58,
    status: '全線順暢', statusColor: COLORS.green,
  },
];

function CommuteCard({ route, onToggle }) {
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
          <Text style={styles.pointKm}>{route.fromKm}</Text>
        </View>
        <View style={styles.routeLine} />
        <Text style={styles.routeDir}>{route.road} {route.dir}</Text>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <Text style={styles.pointName}>{route.to}</Text>
          <Text style={styles.pointKm}>{route.toKm}</Text>
        </View>
      </View>

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
          <Text style={styles.detailLabel}>平日均耗</Text>
          <Text style={styles.detailVal}>{route.avgMin} 分</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>目前路況</Text>
        <View style={[styles.statusBadge, { backgroundColor: route.statusColor === COLORS.green ? COLORS.greenBg : COLORS.yellowBg }]}>
          <Text style={[styles.statusText, { color: route.statusColor === COLORS.green ? COLORS.greenText : COLORS.yellowText }]}>
            {route.status}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function CommuteScreen() {
  const [routes, setRoutes] = useState(DEMO_ROUTES);

  const toggleRoute = (id) => {
    setRoutes(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  return (
    <ScrollView style={styles.scroll}>
      <Text style={styles.pageTitle}>我的通勤</Text>
      <Text style={styles.pageSub}>設定常用路線，出發前自動推播</Text>

      {routes.map(route => (
        <CommuteCard key={route.id} route={route} onToggle={() => toggleRoute(route.id)} />
      ))}

      {/* 推播紀錄 */}
      <Text style={styles.sectionTitle}>今日推播紀錄</Text>
      <View style={styles.pushCard}>
        <Text style={styles.pushTime}>07:20</Text>
        <View style={styles.pushContent}>
          <Text style={styles.pushMsg}>湖口-楊梅外側車速 32 km/h，建議走內側或改走國1高架。預估耗時 58 分。</Text>
          <Text style={styles.pushMeta}>上班路線</Text>
        </View>
      </View>

      {/* 新增按鈕 */}
      <TouchableOpacity style={styles.addBtn}>
        <Text style={styles.addBtnText}>+ 新增通勤路線</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>通勤推播需要開啟通知權限</Text>
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
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 0.5, borderTopColor: COLORS.border, padding: 12, paddingHorizontal: 14 },
  statusLabel: { color: COLORS.gray, fontSize: 12 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '500' },
  sectionTitle: { color: COLORS.dimGray, fontSize: 12, marginLeft: 20, marginTop: 16, marginBottom: 8 },
  pushCard: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: COLORS.card, borderRadius: 10, padding: 12, gap: 10 },
  pushTime: { color: COLORS.dimGray, fontSize: 12, minWidth: 40, paddingTop: 1 },
  pushContent: { flex: 1 },
  pushMsg: { color: COLORS.lightGray, fontSize: 12, lineHeight: 18 },
  pushMeta: { color: COLORS.dimGray, fontSize: 10, marginTop: 4 },
  addBtn: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#444', borderRadius: 12, padding: 14, alignItems: 'center' },
  addBtnText: { color: COLORS.dimGray, fontSize: 14 },
  footer: { color: COLORS.dimGray, fontSize: 10, textAlign: 'center', padding: 20 },
});
