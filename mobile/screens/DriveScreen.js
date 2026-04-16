import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Animated, Dimensions, Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { API_BASE } from '../constants';
import { useSettings } from '../SettingsContext';
import { findNearbyCamera, initSpeedCameras } from '../data/speedCameras';
import {
  announceCamera, announceLaneAdvice, announceBottleneck,
  announcePrediction, announceHighwayEntry, announceHighwayExit,
  updateSpeedHistory, setVoiceEnabled,
} from '../utils/voiceCoach';

const { width: SW } = Dimensions.get('window');

// =====================================================
// 交流道里程對照表 (簡化版，用於顯示位置)
// =====================================================
const INTERCHANGES = {
  '1': [
    { name: '基隆端', km: 0 }, { name: '汐止', km: 12.4 }, { name: '圓山', km: 23.5 },
    { name: '三重', km: 28.6 }, { name: '五股', km: 32.4 }, { name: '林口', km: 41.4 },
    { name: '桃園', km: 52 }, { name: '中壢', km: 62 }, { name: '楊梅', km: 69 },
    { name: '湖口', km: 83 }, { name: '竹北', km: 91 }, { name: '新竹', km: 95.3 },
    { name: '頭份', km: 110.5 }, { name: '苗栗', km: 132 }, { name: '三義', km: 150.7 },
    { name: '豐原', km: 165.5 }, { name: '台中', km: 178.5 }, { name: '彰化', km: 198.5 },
    { name: '員林', km: 211.8 }, { name: '西螺', km: 230.8 }, { name: '斗南', km: 240 },
    { name: '嘉義', km: 264 }, { name: '新營', km: 288.4 }, { name: '台南', km: 315 },
    { name: '岡山', km: 335.5 }, { name: '高雄', km: 357 },
  ],
  '3': [
    { name: '基金', km: 0 }, { name: '南港', km: 21.5 }, { name: '新店', km: 32 },
    { name: '土城', km: 42.5 }, { name: '鶯歌', km: 55 }, { name: '大溪', km: 62 },
    { name: '關西', km: 79 }, { name: '竹南', km: 140 }, { name: '後龍', km: 152 },
    { name: '大甲', km: 185 }, { name: '沙鹿', km: 200 }, { name: '彰化系統', km: 216 },
    { name: '草屯', km: 235 }, { name: '南投', km: 258 }, { name: '斗六', km: 290 },
    { name: '中埔', km: 320 }, { name: '善化', km: 360 }, { name: '關廟', km: 380 },
  ],
  '5': [
    { name: '南港系統', km: 0 }, { name: '石碇', km: 10.9 }, { name: '坪林', km: 22 },
    { name: '頭城', km: 39.2 }, { name: '宜蘭', km: 46.5 }, { name: '羅東', km: 48.2 },
    { name: '蘇澳', km: 54.3 },
  ],
  '1H': [
    { name: '汐止端', km: 12.7 }, { name: '五股轉接', km: 19.3 },
    { name: '板橋', km: 26 }, { name: '中壢端', km: 33 },
  ],
  '2': [
    { name: '桃園', km: 0 }, { name: '大湳', km: 7.2 }, { name: '鶯歌系統', km: 15.5 },
    { name: '機場端', km: 20.3 },
  ],
  '4': [
    { name: '清水端', km: 0 }, { name: '神岡', km: 7.4 }, { name: '豐原端', km: 17.7 },
  ],
  '6': [
    { name: '霧峰系統', km: 0 }, { name: '草屯', km: 9.6 }, { name: '國姓', km: 21.1 },
    { name: '愛蘭', km: 30 }, { name: '埔里端', km: 37 },
  ],
  '8': [
    { name: '台南系統', km: 0 }, { name: '新市', km: 6 }, { name: '新化端', km: 13.2 },
  ],
  '10': [
    { name: '左營端', km: 0 }, { name: '仁武', km: 7 }, { name: '燕巢系統', km: 13.7 },
    { name: '旗山端', km: 33.7 },
  ],
};

function findNearestIC(road, km) {
  const list = INTERCHANGES[road];
  if (!list?.length) return null;
  let nearest = list[0], minD = Math.abs(list[0].km - km);
  for (const ic of list) {
    const d = Math.abs(ic.km - km);
    if (d < minD) { minD = d; nearest = ic; }
  }
  return nearest;
}

// =====================================================
// fetch with retry
// =====================================================
async function fetchRetry(url, { retries = 3, delay = 3000 } = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 503 && i < retries) { await new Promise(r => setTimeout(r, delay)); continue; }
      return r;
    } catch (e) {
      if (i < retries) { await new Promise(r => setTimeout(r, delay)); continue; }
      throw e;
    }
  }
}

// =====================================================
// 主畫面
// =====================================================
export default function DriveScreen() {
  const { sensitivity, setSensitivity } = useSettings();

  // --- 資料 state ---
  const [gpsData, setGpsData] = useState(null);
  const [laneData, setLaneData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gpsError, setGpsError] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [userSpeed, setUserSpeed] = useState(null);
  const [userAltitude, setUserAltitude] = useState(null);
  const [nearbyCamera, setNearbyCamera] = useState(null);
  const [currentLane, setCurrentLane] = useState(null);
  const [laneManualOverride, setLaneManualOverride] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [voiceOn, setVoiceOn] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const wasOnHighwayRef = useRef(false);

  // --- 動畫 ---
  const cardAnim = useRef(new Animated.Value(0)).current;
  const showCard = (show) => {
    Animated.spring(cardAnim, { toValue: show ? 1 : 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
  };

  // --- 資料抓取 ---
  const fetchAll = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGpsError('GPS 權限未授權'); setLoading(false); return; }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude, speed: gpsSpeed, altitude: gpsAlt } = loc.coords;
      const speedKmh = (gpsSpeed != null && gpsSpeed >= 0) ? Math.round(gpsSpeed * 3.6) : null;
      const altM = (gpsAlt != null && gpsAlt >= 0) ? Math.round(gpsAlt) : null;
      setUserSpeed(speedKmh);
      setUserAltitude(altM);

      // 首次取得座標時，預載全台測速照相資料
      initSpeedCameras(latitude, longitude);

      setApiError(null); setGpsError(null);
      const nearbyResp = await fetchRetry(`${API_BASE}/api/v1/nearby?lat=${latitude}&lon=${longitude}`);
      if (!nearbyResp.ok) {
        setNearbyCamera(findNearbyCamera(latitude, longitude));
        setApiError('無法取得路況'); setLoading(false); return;
      }
      const nearbyJson = await nearbyResp.json();
      setGpsData(nearbyJson);

      const { road, direction, mileage, distance_km } = nearbyJson.nearest || {};
      const dir_ = direction === 'N' ? '北向' : direction === 'S' ? '南向' : null;

      // 測速照相
      if (road && distance_km != null && distance_km <= 1) {
        setNearbyCamera(findNearbyCamera(latitude, longitude, { road, direction: dir_, altitude: altM }));
      } else {
        setNearbyCamera(null);
      }

      // 車道資料
      if (road && direction && mileage) {
        const sp = speedKmh != null ? `&speed=${speedKmh}` : '';
        const laneResp = await fetchRetry(
          `${API_BASE}/api/v1/lanes/realtime?road=${road}&dir=${direction}&km=${mileage}${sp}`
        );
        if (laneResp.ok) {
          const laneJson = await laneResp.json();
          setLaneData(laneJson);
          const est = (!laneManualOverride && laneJson.estimated_lane?.confidence !== 'low')
            ? (laneJson.estimated_lane?.lane_name || null) : currentLane;
          if (!laneManualOverride && laneJson.estimated_lane?.confidence !== 'low') setCurrentLane(est);

          // 語音教練
          const mains = (laneJson.lanes || []).filter(l => !l.is_shoulder);
          updateSpeedHistory(mains);
          if (!announcePrediction(mains, est)) {
            announceLaneAdvice(laneJson.advice, est, sensitivity);
          }
        }
      }

      // 語音：進出國道
      const onHw = road && distance_km != null && distance_km <= 1;
      const roadFull = nearbyJson.road || '';
      if (onHw && !wasOnHighwayRef.current) announceHighwayEntry(roadFull, dir_);
      else if (!onHw && wasOnHighwayRef.current) announceHighwayExit();
      wasOnHighwayRef.current = onHw;

      // 語音：壅塞
      const bns = nearbyJson.bottlenecks || [];
      if (bns.length > 0) announceBottleneck(bns);

      setCountdown(30);
    } catch (e) {
      if (!gpsData) setApiError('網路連線異常');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, [fetchAll]);
  useEffect(() => { const t = setInterval(() => setCountdown(p => p > 0 ? p - 1 : 0), 1000); return () => clearInterval(t); }, []);

  // 高頻 GPS
  useEffect(() => {
    let sub = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
        (loc) => {
          const { speed: s, altitude: a } = loc.coords;
          setUserSpeed((s != null && s >= 0) ? Math.round(s * 3.6) : null);
          setUserAltitude((a != null && a >= 0) ? Math.round(a) : null);
        }
      );
    })();
    return () => { if (sub) sub.remove(); };
  }, []);

  // 語音：測速照相
  useEffect(() => { if (nearbyCamera) announceCamera(nearbyCamera, userSpeed); }, [nearbyCamera?.distance]);

  // --- 解析資料 ---
  const road = gpsData?.nearest?.road;
  const distKm = gpsData?.nearest?.distance_km;
  const yourKm = gpsData?.your_km;
  const dirLabel = gpsData?.direction;
  const roadName = gpsData?.road;
  const isOnHighway = gpsData && distKm != null && distKm <= 1;
  const ic = road && yourKm ? findNearestIC(road, yourKm) : null;

  const advice = laneData?.advice;
  const diff = advice?.speed_diff || 0;
  const isHold = diff < sensitivity;
  const bottlenecks = gpsData?.bottlenecks || [];

  // --- 卡片邏輯：決定要顯示什麼卡片 ---
  // 優先順序：測速 > 壅塞 > 車道建議
  let cardType = null; // 'camera' | 'bottleneck' | 'advice' | 'prediction'
  let cardData = {};

  if (nearbyCamera && nearbyCamera.distance <= 1200) {
    cardType = 'camera';
    cardData = nearbyCamera;
  } else if (isOnHighway && bottlenecks.length > 0) {
    cardType = 'bottleneck';
    cardData = bottlenecks[0];
  } else if (isOnHighway && advice && !isHold) {
    cardType = 'advice';
    cardData = { advice, currentLane, diff };
  }

  // 控制卡片動畫
  useEffect(() => { showCard(!!cardType); }, [cardType]);

  // --- 速度顏色 (漸層感：低速藍 → 中速青 → 高速綠 → 超速紅) ---
  const speedNum = userSpeed != null ? userSpeed : 0;
  const isOverSpeed = nearbyCamera && userSpeed != null && userSpeed > nearbyCamera.speedLimit;
  const speedColor = isOverSpeed ? '#FF453A'
    : speedNum > 100 ? '#30D158'
    : speedNum > 70 ? '#64D2FF'
    : speedNum > 40 ? '#5E5CE6'
    : '#AEAEB2';

  // --- Render ---
  return (
    <View style={s.container}>

      {/* ===== 頂部列 ===== */}
      <View style={s.topRow}>
        <View style={s.topLeft} />
        <View style={s.topRight}>
          <TouchableOpacity onPress={() => { const v = !voiceOn; setVoiceOn(v); setVoiceEnabled(v); }} style={s.topBtn}>
            <Text style={s.topBtnText}>{voiceOn ? '🔊' : '🔇'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={s.topBtn}>
            <Text style={[s.topBtnText, { color: '#636366' }]}>⚙︎</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== 載入 / 錯誤 ===== */}
      {loading && (
        <View style={s.center}>
          <Text style={s.loadingText}>定位中...</Text>
        </View>
      )}
      {(gpsError || apiError) && !loading && (
        <View style={s.center}>
          <Text style={s.errorText}>{gpsError || apiError}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); setGpsError(null); setApiError(null); fetchAll(); }}>
            <Text style={s.retryText}>重試</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ===== 主要內容 ===== */}
      {gpsData && !loading && (
        <View style={s.main}>

          {/* 時速 — 永遠的主角 */}
          <View style={s.speedSection}>
            <Text style={[s.speedNum, { color: speedColor }]}>
              {userSpeed != null ? userSpeed : '--'}
            </Text>
            <Text style={s.speedUnit}>km/h</Text>

            {/* 國道順暢時的小提示 */}
            {isOnHighway && isHold && !cardType && (
              <Text style={s.holdText}>✓ 維持車道</Text>
            )}
          </View>

          {/* 限速路牌 (測速照相接近時) */}
          {nearbyCamera && nearbyCamera.distance <= 1200 && (
            <View style={s.speedSign}>
              <View style={[s.speedSignCircle, isOverSpeed && s.speedSignOver]}>
                <Text style={[s.speedSignNum, isOverSpeed && { color: '#FF3B30' }]}>
                  {nearbyCamera.speedLimit}
                </Text>
              </View>
              <Text style={s.speedSignDist}>{nearbyCamera.distance}m</Text>
            </View>
          )}

          {/* ===== 浮出卡片 ===== */}
          <Animated.View style={[s.card, {
            opacity: cardAnim,
            transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          }]}>
            {/* 車道建議卡片 */}
            {cardType === 'advice' && (
              <View style={s.cardInner}>
                <View style={[s.cardAccent, { backgroundColor: '#5E5CE6' }]} />
                <View style={s.cardContent}>
                  <Text style={[s.cardAction, { color: '#BDB6FF' }]}>
                    → {cardData.currentLane ? `${cardData.currentLane} → ${cardData.advice.best_lane}` : `切 ${cardData.advice.best_lane}`}
                  </Text>
                  <Text style={s.cardReason}>快 {Math.round(cardData.diff)} km/h</Text>
                  {!voiceOn && <Text style={s.cardUpgrade}>🔇 升級 Pro 開啟語音提醒</Text>}
                </View>
              </View>
            )}

            {/* 預測建議卡片 */}
            {cardType === 'prediction' && (
              <View style={s.cardInner}>
                <View style={[s.cardAccent, { backgroundColor: '#64D2FF' }]} />
                <View style={s.cardContent}>
                  <View style={s.cardHeader}>
                    <Text style={[s.cardAction, { color: '#A0E8FF' }]}>→ 提前切{cardData.bestLane}</Text>
                    <View style={s.predBadge}><Text style={s.predBadgeText}>預測</Text></View>
                  </View>
                  <Text style={s.cardReason}>{cardData.reason}</Text>
                </View>
              </View>
            )}

            {/* 壅塞卡片 */}
            {cardType === 'bottleneck' && (
              <View style={s.cardInner}>
                <View style={[s.cardAccent, { backgroundColor: '#FF9F0A' }]} />
                <View style={s.cardContent}>
                  <Text style={s.cardActionWarn}>⚠ 前方壅塞</Text>
                  <Text style={s.cardReason}>
                    {cardData.worst_lane} 降至 {Math.round(cardData.worst_speed)} km/h
                  </Text>
                  <Text style={s.cardSub}>{cardData.start} → {cardData.end}</Text>
                </View>
              </View>
            )}

            {/* 測速照相卡片 */}
            {cardType === 'camera' && (
              <View style={s.cardInner}>
                <View style={[s.cardAccent, { backgroundColor: isOverSpeed ? '#FF453A' : '#FF9F0A' }]} />
                <View style={s.cardContent}>
                  <Text style={[s.cardActionWarn, isOverSpeed && { color: '#FF453A' }]}>
                    {isOverSpeed ? '⚠ 超速！' : '測速照相'}
                  </Text>
                  <Text style={s.cardReason}>
                    限速 {cardData.speedLimit} km/h · {cardData.name}
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>

          {/* 底部資訊列 */}
          <View style={s.bottomRow}>
            <Text style={s.bottomText}>
              {isOnHighway
                ? `${roadName} ${dirLabel} · ${ic ? `近${ic.name}` : `${yourKm}K`}`
                : '目前不在國道上'
              }
            </Text>
          </View>
        </View>
      )}

      {/* ===== 設定覆蓋層 ===== */}
      {showSettings && (
        <View style={s.settingsOverlay}>
          <View style={s.settingsCard}>
            <View style={s.settingsHeader}>
              <Text style={s.settingsTitle}>設定</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Text style={s.settingsClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 語音提醒 */}
            <View style={s.settingRow}>
              <Text style={s.settingLabel}>語音提醒</Text>
              <TouchableOpacity
                style={[s.settingToggle, voiceOn && s.settingToggleOn]}
                onPress={() => { const v = !voiceOn; setVoiceOn(v); setVoiceEnabled(v); }}
              >
                <Text style={s.settingToggleText}>{voiceOn ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
            </View>

            {/* 靈敏度 */}
            <View style={s.settingRow}>
              <Text style={s.settingLabel}>車道靈敏度</Text>
              <View style={s.segCtrl}>
                {[10, 15, 20].map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[s.segBtn, sensitivity === v && s.segBtnOn]}
                    onPress={() => setSensitivity(v)}
                  >
                    <Text style={[s.segText, sensitivity === v && s.segTextOn]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Text style={s.settingHint}>速差 ≥ {sensitivity} km/h 才建議切換</Text>

            {/* 關於 */}
            <View style={s.settingDivider} />
            <TouchableOpacity onPress={() => Linking.openURL('https://qqoqto.github.io/lanepilot/privacy-policy.html')}>
              <Text style={s.settingLink}>隱私權政策</Text>
            </TouchableOpacity>
            <Text style={s.settingCredit}>路道通 LanePilot v1.0{'\n'}資料來源：交通部高速公路局</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// =====================================================
// Apple Maps 風格樣式
// =====================================================
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A10' },

  // 頂部
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 8,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gpsDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3A3A3C' },
  gpsDotOn: { backgroundColor: '#30D158' },
  countdown: { color: '#3A3A3C', fontSize: 11 },
  topBtn: { padding: 8 },
  topBtnText: { fontSize: 18 },

  // 載入/錯誤
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  loadingText: { color: '#8E8E93', fontSize: 17 },
  errorText: { color: '#8E8E93', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  retryBtn: { backgroundColor: '#0A84FF20', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: '#0A84FF', fontSize: 15, fontWeight: '600' },

  // 主要區域
  main: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // 時速
  speedSection: { alignItems: 'center' },
  speedNum: {
    fontSize: 130, fontWeight: '300', lineHeight: 140,
    fontVariant: ['tabular-nums'], letterSpacing: -3,
  },
  speedUnit: { color: '#8E8E93', fontSize: 20, fontWeight: '500', marginTop: -2 },
  holdText: { color: '#30D158', fontSize: 16, fontWeight: '600', marginTop: 20 },

  // 限速路牌
  speedSign: { alignItems: 'center', marginTop: 24 },
  speedSignCircle: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 3, borderColor: '#FF453A',
    backgroundColor: '#1A1A24',
    alignItems: 'center', justifyContent: 'center',
  },
  speedSignOver: { backgroundColor: '#2A0A10', borderColor: '#FF453A' },
  speedSignNum: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  speedSignDist: { color: '#8E8E93', fontSize: 12, marginTop: 4 },

  // 浮出卡片
  card: {
    position: 'absolute', bottom: 60, left: 16, right: 16,
    backgroundColor: '#1A1A24',
    borderRadius: 20, paddingVertical: 20, paddingHorizontal: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 12,
    borderWidth: 0.5, borderColor: '#2A2A3A',
  },
  cardInner: { flexDirection: 'row', alignItems: 'stretch' },
  cardAccent: { width: 4, borderRadius: 2, marginRight: 16 },
  cardContent: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardAction: { fontSize: 22, fontWeight: '600', letterSpacing: -0.3 },
  cardActionWarn: { color: '#FFB340', fontSize: 22, fontWeight: '600', letterSpacing: -0.3 },
  cardReason: { color: '#AEAEB2', fontSize: 15, marginTop: 6 },
  cardSub: { color: '#636366', fontSize: 13, marginTop: 4 },
  cardUpgrade: { color: '#636366', fontSize: 11, marginTop: 14 },
  predBadge: {
    backgroundColor: '#64D2FF20', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  predBadgeText: { color: '#64D2FF', fontSize: 12, fontWeight: '600' },

  // 底部
  bottomRow: {
    position: 'absolute', bottom: 20, left: 0, right: 0,
    alignItems: 'center',
  },
  bottomText: { color: '#5E5CE6', fontSize: 13, fontWeight: '500' },

  // 設定覆蓋層
  settingsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24,
  },
  settingsCard: {
    backgroundColor: '#1A1A24', borderRadius: 20,
    padding: 24, width: '100%', maxWidth: 360,
    borderWidth: 0.5, borderColor: '#2A2A3A',
  },
  settingsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 28,
  },
  settingsTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '600' },
  settingsClose: { color: '#8E8E93', fontSize: 22, padding: 4 },

  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  settingLabel: { color: '#FFFFFF', fontSize: 15 },
  settingToggle: {
    backgroundColor: '#3A3A3C', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  settingToggleOn: { backgroundColor: '#30D158' },
  settingToggleText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  segCtrl: { flexDirection: 'row', backgroundColor: '#2C2C2E', borderRadius: 8, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  segBtnOn: { backgroundColor: '#5E5CE6' },
  segText: { color: '#8E8E93', fontSize: 13 },
  segTextOn: { color: '#FFFFFF', fontWeight: '600' },

  settingHint: { color: '#636366', fontSize: 11, marginBottom: 24 },
  settingDivider: { height: 0.5, backgroundColor: '#2C2C2E', marginBottom: 16 },
  settingLink: { color: '#64D2FF', fontSize: 14, marginBottom: 16 },
  settingCredit: { color: '#3A3A3C', fontSize: 11, textAlign: 'center', lineHeight: 18 },
});
