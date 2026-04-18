import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Animated, Dimensions, Linking, ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { API_BASE } from '../constants';
import { useSettings } from '../SettingsContext';
import { findNearbyCamera, initSpeedCameras } from '../data/speedCameras';

const { width: SW } = Dimensions.get('window');

// =====================================================
// 交流道里程對照表
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

// 路段速度 → 色帶色
function segColor(speed) {
  if (!speed || speed <= 0) return '#3A3A3C';
  if (speed >= 80) return '#1D9E75'; // 綠 順暢
  if (speed >= 60) return '#D4A017'; // 黃 車多
  if (speed >= 40) return '#D97219'; // 橘 緩慢
  return '#D94A4A';                  // 紅 壅塞
}

// 車道色塊色（和 RealtimeScreen 對應）
function laneColor(speed) {
  if (!speed || speed <= 1) return { bg: '#3A1818', text: '#FFB4B4' };
  if (speed >= 80) return { bg: '#1A3A22', text: '#A5E29A' };
  if (speed >= 60) return { bg: '#3A2E10', text: '#F4C77A' };
  if (speed >= 40) return { bg: '#3A2410', text: '#F49E68' };
  return { bg: '#3A1818', text: '#FF8080' };
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
  const [showSettings, setShowSettings] = useState(false);
  const [now, setNow] = useState(new Date());

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

      if (road && distance_km != null && distance_km <= 1) {
        setNearbyCamera(findNearbyCamera(latitude, longitude, { road, direction: dir_, altitude: altM }));
      } else {
        setNearbyCamera(findNearbyCamera(latitude, longitude));
      }

      if (road && direction && mileage) {
        const sp = speedKmh != null ? `&speed=${speedKmh}` : '';
        const laneResp = await fetchRetry(
          `${API_BASE}/api/v1/lanes/realtime?road=${road}&dir=${direction}&km=${mileage}${sp}`
        );
        if (laneResp.ok) {
          const laneJson = await laneResp.json();
          setLaneData(laneJson);
          if (!laneManualOverride && laneJson.estimated_lane?.confidence !== 'low') {
            setCurrentLane(laneJson.estimated_lane?.lane_name || null);
          }
        }
      }

      setCountdown(30);
    } catch (e) {
      if (!gpsData) setApiError('網路連線異常');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, [fetchAll]);
  useEffect(() => { const t = setInterval(() => setCountdown(p => p > 0 ? p - 1 : 0), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);

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

  // --- 解析資料 ---
  const road = gpsData?.nearest?.road;
  const distKm = gpsData?.nearest?.distance_km;
  const yourKm = gpsData?.your_km;
  const dirLabel = gpsData?.direction;
  const roadName = gpsData?.road;
  const isOnHighway = gpsData && distKm != null && distKm <= 1;
  const ic = road && yourKm ? findNearestIC(road, yourKm) : null;

  const cameraActive = !!(nearbyCamera && nearbyCamera.distance <= 1200);
  const isOverSpeed = cameraActive && userSpeed != null && userSpeed > nearbyCamera.speedLimit;

  const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

  // --- Render ---
  return (
    <View style={s.container}>

      {/* ===== 頂部列 ===== */}
      <View style={s.topRow}>
        <View style={s.topLeft} />
        <View style={s.topRight}>
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
          {cameraActive ? (
            <CameraView
              camera={nearbyCamera}
              userSpeed={userSpeed}
              isOverSpeed={isOverSpeed}
              fallbackRoadName={roadName}
            />
          ) : !isOnHighway ? (
            <SpeedometerView
              speed={userSpeed}
              timeStr={timeStr}
            />
          ) : (
            <HighwayView
              gpsData={gpsData}
              laneData={laneData}
              userSpeed={userSpeed}
              yourKm={yourKm}
              roadName={roadName}
              dirLabel={dirLabel}
              ic={ic}
              currentLane={currentLane}
              setCurrentLane={(l) => { setCurrentLane(l); setLaneManualOverride(true); }}
              resetLane={() => { setCurrentLane(null); setLaneManualOverride(false); }}
            />
          )}
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
// 模式 B: 尚未進入國道 — 圓環速度表 (1.jpg)
// =====================================================
function SpeedometerView({ speed, timeStr }) {
  const size = 290;
  const borderW = 14;
  return (
    <View style={s.sbWrap}>
      <Text style={s.sbClock}>{timeStr}</Text>

      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: borderW,
        borderTopColor: '#0A84FF',
        borderRightColor: '#FF3B30',
        borderBottomColor: '#FF3B30',
        borderLeftColor: '#FFFFFF',
        transform: [{ rotate: '-45deg' }],
        alignItems: 'center', justifyContent: 'center',
      }}>
        <View style={{ transform: [{ rotate: '45deg' }], alignItems: 'center' }}>
          <Text style={s.sbSpeed}>{speed != null ? speed : '--'}</Text>
          <Text style={s.sbUnit}>km/h</Text>
        </View>
      </View>

      <View style={s.sbGps}>
        <View style={s.sbGpsBars}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <View key={i} style={[s.sbGpsBar, { height: 4 + i * 4 }]} />
          ))}
        </View>
        <Text style={s.sbGpsText}>G P S</Text>
      </View>
    </View>
  );
}

// =====================================================
// 模式 A: 測速照相接近中 (6.jpg)
// =====================================================
function CameraView({ camera, userSpeed, isOverSpeed, fallbackRoadName }) {
  const roadText = (camera.road || fallbackRoadName || '一般道路')
    .replace('國1高架', '國道1號高架').replace(/^國(\d+)/, '國道$1號');
  const maxDist = 1200;
  const fillRatio = Math.max(0.08, Math.min(1, (maxDist - camera.distance) / maxDist));

  const spColor = isOverSpeed ? '#FF3B30'
    : (userSpeed != null && camera.speedLimit != null && userSpeed >= camera.speedLimit - 5) ? '#FFB340'
    : '#6EE07A';

  return (
    <View style={s.cvWrap}>
      <View style={s.cvTopRow}>
        <View style={{ flex: 1 }}>
          <View style={s.cvCamIconRow}>
            <View style={s.cvCamIcon}>
              <View style={s.cvCamLens} />
              <View style={s.cvCamLens2} />
              <View style={s.cvCamStripe} />
            </View>
            <View style={s.cvFixedBadge}>
              <Text style={s.cvFixedText}>固</Text>
            </View>
          </View>
          <View style={s.cvRoadRow}>
            <View style={s.cvFlowerBadge}>
              <Text style={s.cvFlowerText}>1</Text>
            </View>
            <View style={s.cvRoadLabel}>
              <Text style={s.cvRoadText}>{roadText}</Text>
            </View>
          </View>
        </View>

        <View style={s.cvLimitCircle}>
          <Text style={s.cvLimitNum}>{camera.speedLimit}</Text>
        </View>
      </View>

      <View style={s.cvDistBar}>
        <View style={{ flex: 1 - fillRatio, backgroundColor: 'transparent' }} />
        <View style={[s.cvDistFill, { flex: fillRatio }]}>
          <Text style={s.cvDistText}>{camera.distance} m</Text>
        </View>
      </View>

      {!!camera.name && (
        <Text style={s.cvCamName} numberOfLines={1}>{camera.name}</Text>
      )}

      <View style={s.cvSpeedBox}>
        <Text style={[s.cvSpeedNum, { color: spColor }]}>
          {userSpeed != null ? userSpeed : '--'}
        </Text>
        <Text style={[s.cvSpeedUnit, { color: spColor }]}>km/h</Text>
      </View>
    </View>
  );
}

// =====================================================
// 模式 C: 國道主畫面 — 上面路段色帶 + 下面車道色塊 (2-5.jpg)
// =====================================================
function HighwayView({
  gpsData, laneData, userSpeed, yourKm, roadName, dirLabel, ic,
  currentLane, setCurrentLane, resetLane,
}) {
  const dirN = dirLabel === '北向';
  const stations = (gpsData?.stations || []).filter(s => (s.lanes || []).some(l => !l.is_shoulder && l.speed > 0));

  // 排序：N 向由北到南 (km 小到大)，S 向由南到北 (km 大到小)；讓畫面由上往下是「前進方向」
  const sorted = [...stations].sort((a, b) => dirN ? a.mileage - b.mileage : b.mileage - a.mileage);

  // 挑使用者前方 + 自身所在的 4 個站
  const ahead = sorted.filter(s => dirN ? s.mileage >= yourKm - 1 : s.mileage <= yourKm + 1).slice(0, 4);

  // 計算每站平均速度
  const withAvg = ahead.map(s => {
    const mains = (s.lanes || []).filter(l => !l.is_shoulder && l.speed > 0);
    const avg = mains.length ? Math.round(mains.reduce((a, b) => a + b.speed, 0) / mains.length) : 0;
    return { ...s, avgSpeed: avg };
  });

  // ETA 粗估：從目前位置到該站的距離 / 平均速度
  function eta(st) {
    const dist = Math.abs(st.mileage - yourKm);
    const sp = st.avgSpeed || 0;
    if (!sp) return { min: '--', km: dist.toFixed(1) };
    return { min: Math.max(1, Math.round(dist / sp * 60)), km: dist.toFixed(1) };
  }

  // 目前所在車站 (最靠近 yourKm)
  const selfStation = laneData ? { lanes: laneData.lanes || [], location: laneData.location } : null;
  const mainLanes = (selfStation?.lanes || []).filter(l => !l.is_shoulder);
  const advice = laneData?.advice;

  // 速度顏色 (使用者)
  const spNum = userSpeed != null ? userSpeed : 0;
  const userSpColor = spNum > 100 ? '#30D158' : spNum > 70 ? '#64D2FF' : spNum > 40 ? '#5E5CE6' : '#AEAEB2';

  return (
    <ScrollView style={s.hvScroll} contentContainerStyle={s.hvContent} showsVerticalScrollIndicator={false}>
      {/* ===== 上半：路段色帶 ===== */}
      <View style={s.hvStrip}>
        {withAvg.length === 0 ? (
          <Text style={s.hvEmpty}>前方路段資料載入中...</Text>
        ) : withAvg.map((st, i) => {
          const next = withAvg[i + 1];
          const e = eta(st);
          const roadIcon = roadName?.includes('高架') ? '1高架' : roadName?.match(/國(\d+)/)?.[1] || '1';
          return (
            <Fragment key={st.vd_id || i}>
              {/* 交流道列 */}
              <View style={s.hvRow}>
                <View style={s.hvBadge}>
                  <Text style={s.hvBadgeText}>{Math.round(st.mileage)} {st.location || ''}</Text>
                </View>
                <View style={s.hvEtaCol}>
                  <Text style={s.hvEtaText}>{e.min}分鐘 · {e.km}k</Text>
                </View>
              </View>
              {/* 速度色帶（連接到下一站） */}
              {next && (
                <View style={s.hvBarRow}>
                  <View style={[s.hvBar, { backgroundColor: segColor(st.avgSpeed) }]}>
                    <Text style={s.hvBarNum}>{st.avgSpeed || '--'}</Text>
                    <Text style={s.hvBarUnit}>km/h</Text>
                  </View>
                  <View style={s.hvBarSide} />
                </View>
              )}
            </Fragment>
          );
        })}
        {/* 使用者位置 marker */}
        <View style={s.hvUserRow}>
          <View style={s.hvUserIcon}>
            <Text style={s.hvUserIconText}>{roadName?.match(/國(\d+)/)?.[1] || '1'}</Text>
          </View>
          <View style={s.hvUserKmTag}>
            <Text style={s.hvUserKmText}>{yourKm} K</Text>
          </View>
        </View>
      </View>

      {/* ===== 下半：車道速度色塊 ===== */}
      {mainLanes.length > 0 && (
        <View style={s.hvLanes}>
          <View style={s.hvLanesHeaderRow}>
            <Text style={s.hvLanesHeader}>
              {roadName} {dirLabel} · {ic ? `近${ic.name}` : ''}
            </Text>
            {advice && advice.speed_diff >= 10 && (
              <Text style={s.hvAdviceHint}>
                → {currentLane ? `${currentLane} → ${advice.best_lane}` : `建議 ${advice.best_lane}`} (快 {Math.round(advice.speed_diff)})
              </Text>
            )}
          </View>
          <View style={s.hvLaneRow}>
            {mainLanes.map((lane, idx) => {
              const c = laneColor(lane.speed);
              const isBest = advice && lane.name === advice.best_lane;
              const isCurrent = currentLane === lane.name;
              const stuck = lane.speed <= 1;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[s.hvLaneBlock, { backgroundColor: c.bg }, isCurrent && s.hvLaneBlockCurrent]}
                  activeOpacity={0.7}
                  onPress={() => setCurrentLane(lane.name)}
                >
                  {isBest && !isCurrent && <View style={s.hvLaneBestDot} />}
                  {isCurrent && <Text style={s.hvLaneHere}>你在這</Text>}
                  <Text style={[s.hvLaneName, { color: c.text }]}>{lane.name}</Text>
                  <Text style={s.hvLaneSpeed}>{stuck ? '!' : Math.round(lane.speed)}</Text>
                  <Text style={[s.hvLaneUnit, { color: c.text }]}>{stuck ? '靜止' : 'km/h'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {currentLane && (
            <TouchableOpacity onPress={resetLane} style={{ alignSelf: 'center', padding: 6 }}>
              <Text style={s.hvLaneReset}>重設車道</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ===== 使用者目前速度 ===== */}
      <View style={s.hvUserSpeed}>
        <Text style={[s.hvUserSpeedNum, { color: userSpColor }]}>
          {userSpeed != null ? userSpeed : '--'}
        </Text>
        <Text style={s.hvUserSpeedUnit}>km/h</Text>
      </View>
    </ScrollView>
  );
}

// =====================================================
// 樣式
// =====================================================
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A10' },

  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 8,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topBtn: { padding: 8 },
  topBtnText: { fontSize: 18 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  loadingText: { color: '#8E8E93', fontSize: 17 },
  errorText: { color: '#8E8E93', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  retryBtn: { backgroundColor: '#0A84FF20', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: '#0A84FF', fontSize: 15, fontWeight: '600' },

  main: { flex: 1, width: '100%' },

  // ===== SpeedometerView =====
  sbWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10 },
  sbClock: { color: '#64D2FF', fontSize: 54, fontWeight: '300', letterSpacing: 2, marginBottom: 24 },
  sbSpeed: { color: '#FFFFFF', fontSize: 120, fontWeight: '300', lineHeight: 130, letterSpacing: -4 },
  sbUnit: { color: '#8E8E93', fontSize: 20, fontWeight: '500', marginTop: -8 },
  sbGps: { alignItems: 'center', marginTop: 40 },
  sbGpsBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  sbGpsBar: { width: 5, backgroundColor: '#64D2FF', borderRadius: 1 },
  sbGpsText: { color: '#64D2FF', fontSize: 11, letterSpacing: 4, marginTop: 4 },

  // ===== CameraView =====
  cvWrap: { flex: 1, paddingHorizontal: 22, paddingTop: 10 },
  cvTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cvCamIconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cvCamIcon: {
    width: 60, height: 78, position: 'relative',
    backgroundColor: '#B8BFC7', borderRadius: 4,
    borderWidth: 2, borderColor: '#000',
  },
  cvCamLens: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#000', position: 'absolute', top: 8, left: 8,
    borderWidth: 2, borderColor: '#4A5058',
  },
  cvCamLens2: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#000', position: 'absolute', top: 36, left: 10,
    borderWidth: 2, borderColor: '#4A5058',
  },
  cvCamStripe: {
    position: 'absolute', bottom: 0, right: -10, width: 16, height: 54,
    backgroundColor: '#FFDC42',
  },
  cvFixedBadge: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 2, borderColor: '#FF3B30',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 6,
  },
  cvFixedText: { color: '#FF3B30', fontWeight: '900', fontSize: 22 },
  cvRoadRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  cvFlowerBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 2, borderColor: '#1D9E75',
    alignItems: 'center', justifyContent: 'center',
  },
  cvFlowerText: { color: '#1D9E75', fontWeight: '900', fontSize: 14 },
  cvRoadLabel: {
    backgroundColor: 'transparent',
    borderWidth: 2, borderColor: '#FFFFFF',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8,
  },
  cvRoadText: { color: '#FFFFFF', fontWeight: '700', fontSize: 17 },
  cvLimitCircle: {
    width: 130, height: 130, borderRadius: 65,
    borderWidth: 11, borderColor: '#FF3B30',
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  cvLimitNum: { color: '#000000', fontSize: 56, fontWeight: '900' },

  cvDistBar: {
    marginTop: 22, height: 52,
    borderWidth: 2, borderColor: '#8E95A0', borderRadius: 26,
    flexDirection: 'row', overflow: 'hidden',
    backgroundColor: '#0A0A10',
  },
  cvDistFill: {
    backgroundColor: '#8AD97A',
    alignItems: 'center', justifyContent: 'center',
  },
  cvDistText: { color: '#0A2510', fontSize: 24, fontWeight: '700' },
  cvCamName: { color: '#8E8E93', fontSize: 12, marginTop: 10, textAlign: 'center' },

  cvSpeedBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cvSpeedNum: { fontSize: 180, fontWeight: '800', lineHeight: 190, letterSpacing: -6 },
  cvSpeedUnit: { fontSize: 22, fontWeight: '600', marginTop: -4 },

  // ===== HighwayView =====
  hvScroll: { flex: 1 },
  hvContent: { paddingHorizontal: 14, paddingBottom: 30 },
  hvStrip: {
    backgroundColor: '#0F1930',
    borderWidth: 1, borderColor: '#5E5CE6',
    borderRadius: 20, padding: 14,
  },
  hvEmpty: { color: '#8E8E93', textAlign: 'center', padding: 30, fontSize: 13 },
  hvRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2, minHeight: 36 },
  hvBadge: {
    backgroundColor: '#FFC857',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  hvBadgeText: { color: '#0A0A10', fontWeight: '700', fontSize: 14 },
  hvEtaCol: { flex: 1, alignItems: 'flex-end' },
  hvEtaText: { color: '#D1D5DB', fontSize: 14 },
  hvBarRow: { flexDirection: 'row', alignItems: 'stretch', marginVertical: 2 },
  hvBar: {
    width: 62, marginLeft: 8,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    minHeight: 70,
  },
  hvBarNum: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  hvBarUnit: { color: '#FFFFFF', fontSize: 11, opacity: 0.9, marginTop: -2 },
  hvBarSide: { flex: 1 },
  hvUserRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginLeft: 6 },
  hvUserIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 2, borderColor: '#1D9E75',
    alignItems: 'center', justifyContent: 'center',
  },
  hvUserIconText: { color: '#1D9E75', fontWeight: '900', fontSize: 13 },
  hvUserKmTag: {
    marginLeft: 6,
    backgroundColor: '#1D9E75',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  hvUserKmText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  // 下半：車道色塊
  hvLanes: { marginTop: 18 },
  hvLanesHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  hvLanesHeader: { color: '#8E8E93', fontSize: 13 },
  hvAdviceHint: { color: '#BDB6FF', fontSize: 12, fontWeight: '600' },
  hvLaneRow: { flexDirection: 'row', gap: 6 },
  hvLaneBlock: {
    flex: 1, borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', minHeight: 86,
    borderWidth: 2, borderColor: 'transparent',
  },
  hvLaneBlockCurrent: { borderColor: '#64D2FF' },
  hvLaneBestDot: {
    position: 'absolute', top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#30D158',
  },
  hvLaneHere: { position: 'absolute', top: 4, color: '#64D2FF', fontSize: 10, fontWeight: '700' },
  hvLaneName: { fontSize: 12, fontWeight: '600', marginTop: 12 },
  hvLaneSpeed: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginTop: 2 },
  hvLaneUnit: { fontSize: 11 },
  hvLaneReset: { color: '#64D2FF', fontSize: 13, marginTop: 6 },

  // 底部：使用者速度
  hvUserSpeed: { alignItems: 'center', marginTop: 20 },
  hvUserSpeedNum: { fontSize: 110, fontWeight: '300', lineHeight: 120, letterSpacing: -3, fontVariant: ['tabular-nums'] },
  hvUserSpeedUnit: { color: '#8E8E93', fontSize: 18, fontWeight: '500', marginTop: -6 },

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
