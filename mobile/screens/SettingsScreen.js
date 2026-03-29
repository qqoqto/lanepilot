import { StyleSheet, Text, View, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { COLORS } from '../constants';
import { useSettings } from '../SettingsContext';

function SettingRow({ label, sub, right }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function SettingToggle({ label, sub, value, onToggle }) {
  return (
    <SettingRow label={label} sub={sub} right={
      <Switch value={value} onValueChange={onToggle}
        trackColor={{ false: '#444', true: COLORS.greenBg }} thumbColor={COLORS.white} />
    } />
  );
}

function SettingValue({ label, sub, value, accent }) {
  return (
    <SettingRow label={label} sub={sub} right={
      <Text style={[styles.rowValue, accent && { color: COLORS.accent }]}>{value}</Text>
    } />
  );
}

function SegmentControl({ options, selected, onSelect }) {
  return (
    <View style={styles.segCtrl}>
      {options.map(opt => (
        <TouchableOpacity key={opt.value} style={[styles.segBtn, selected === opt.value && styles.segActive]}
          onPress={() => onSelect(opt.value)}>
          <Text style={[styles.segText, selected === opt.value && styles.segActiveText]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const {
    sensitivity, setSensitivity,
    voice, setVoice,
    commutePush, setCommutePush,
    enroutePush, setEnroutePush,
    bottleneckAlert, setBottleneckAlert,
  } = useSettings();

  const sensitivityOptions = [
    { label: '10', value: 10 },
    { label: '15', value: 15 },
    { label: '20', value: 20 },
  ];

  return (
    <ScrollView style={styles.scroll}>
      <Text style={styles.pageTitle}>設定</Text>

      {/* 車道建議 */}
      <Text style={styles.sectionTitle}>車道建議</Text>
      <View style={styles.group}>
        <SettingRow label="建議靈敏度" sub={`速差 >= ${sensitivity} km/h 才提醒切換`} right={
          <SegmentControl options={sensitivityOptions} selected={sensitivity} onSelect={setSensitivity} />
        } />
        <SettingToggle label="語音播報" sub="自動唸出車道建議" value={voice} onToggle={setVoice} />
        <SettingValue label="語音語言" value="中文" accent />
      </View>

      {/* 通知 */}
      <Text style={styles.sectionTitle}>通知</Text>
      <View style={styles.group}>
        <SettingToggle label="通勤推播" sub="出發前 10 分鐘" value={commutePush} onToggle={setCommutePush} />
        <SettingToggle label="途中更新" sub="上國道後每 5 分鐘" value={enroutePush} onToggle={setEnroutePush} />
        <SettingToggle label="瓶頸警報" sub="前方突然壅塞時提醒" value={bottleneckAlert} onToggle={setBottleneckAlert} />
      </View>

      {/* 顯示 */}
      <Text style={styles.sectionTitle}>顯示</Text>
      <View style={styles.group}>
        <SettingValue label="深色模式" value="跟隨系統" accent />
        <SettingValue label="速度單位" value="km/h" />
        <SettingValue label="地圖樣式" value="簡約深色" />
      </View>

      {/* 關於 */}
      <Text style={styles.sectionTitle}>關於</Text>
      <View style={styles.group}>
        <SettingValue label="版本" value="1.3.0 (MVP)" />
        <SettingValue label="資料來源" value="高公局交通資料庫" />
        <SettingValue label="GitHub" value="qqoqto/lanepilot" accent />
      </View>

      <Text style={styles.credit}>路道通 LanePilot{'\n'}資料來源：交通部高速公路局「交通資料庫」</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.bg },
  pageTitle: { color: COLORS.white, fontSize: 22, fontWeight: '600', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  sectionTitle: { color: COLORS.dimGray, fontSize: 11, marginLeft: 20, marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  group: { marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  rowLeft: { flex: 1, marginRight: 12 },
  rowLabel: { color: COLORS.lightGray, fontSize: 14 },
  rowSub: { color: COLORS.dimGray, fontSize: 11, marginTop: 1 },
  rowValue: { color: COLORS.gray, fontSize: 14 },
  segCtrl: { flexDirection: 'row', backgroundColor: COLORS.bg, borderRadius: 8, borderWidth: 0.5, borderColor: '#333', overflow: 'hidden' },
  segBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  segActive: { backgroundColor: COLORS.accent },
  segText: { color: COLORS.gray, fontSize: 12 },
  segActiveText: { color: '#04342C', fontWeight: '600' },
  credit: { color: COLORS.dimGray, fontSize: 11, textAlign: 'center', padding: 24, lineHeight: 18 },
});
