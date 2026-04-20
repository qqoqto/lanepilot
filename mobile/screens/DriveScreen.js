import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Animated, Dimensions, Linking, ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { API_BASE } from '../constants';
import { useSettings } from '../SettingsContext';
import { findNearbyCamera, initSpeedCameras, getDistanceMeters } from '../data/speedCameras';

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

// 兩點間方位角 (度，0=北、順時針)
function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function angleDiffDeg(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
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
  const [userLat, setUserLat] = useState(null);
  const [userLon, setUserLon] = useState(null);
  const [userHeading, setUserHeading] = useState(null);
  const [nearbyCamera, setNearbyCamera] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const [showSettings, setShowSettings] = useState(false);
  const [now, setNow] = useState(new Date());

  // --- 資料抓取 ---
  const fetchAll = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGpsError('GPS 權限未授權'); setLoading(false); return; }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude, speed: gpsSpeed, altitude: gpsAlt, heading: gpsHeading } = loc.coords;
      const speedKmh = (gpsSpeed != null && gpsSpeed >= 0) ? Math.round(gpsSpeed * 3.6) : null;
      const altM = (gpsAlt != null && gpsAlt >= 0) ? Math.round(gpsAlt) : null;
      setUserSpeed(speedKmh);
      setUserAltitude(altM);
      setUserLat(latitude);
      setUserLon(longitude);
      if (gpsHeading != null && gpsHeading >= 0) setUserHeading(gpsHeading);

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
        setNearbyCamera(findNearbyCamera(latitude, longitude, {
          road, direction: dir_, altitude: altM, yourKm: nearbyJson.your_km,
        }));
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
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 3 },
        (loc) => {
          const { latitude, longitude, speed: s, altitude: a, heading: h } = loc.coords;
          setUserLat(latitude);
          setUserLon(longitude);
          setUserSpeed((s != null && s >= 0) ? Math.round(s * 3.6) : null);
          setUserAltitude((a != null && a >= 0) ? Math.round(a) : null);
          if (h != null && h >= 0) setUserHeading(h);
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
  // 已在高速判定：距最近 VD 站 ≤ 3km，或後端已回車道資料
  const hasLanes = !!(laneData && (laneData.lanes || []).length > 0);
  const isOnHighway = !!(gpsData && ((distKm != null && distKm <= 3) || hasLanes));
  const ic = road && yourKm ? findNearestIC(road, yourKm) : null;

  // 即時重算與測速照相的距離與方位（每次 GPS 更新都會重新計算）
  let camDist = null;
  let camAhead = true;
  if (nearbyCamera && userLat != null && userLon != null && nearbyCamera.lat != null && nearbyCamera.lon != null) {
    camDist = Math.round(getDistanceMeters(userLat, userLon, nearbyCamera.lat, nearbyCamera.lon));
    if (userHeading != null) {
      const b = bearingDeg(userLat, userLon, nearbyCamera.lat, nearbyCamera.lon);
      // 方位差 > 90° 視為已通過（照相在身後）
      camAhead = angleDiffDeg(b, userHeading) <= 90;
    }
  }
  // 三段式警示：
  //   ≤ 800m + 前方 → 顯示底部 Banner (不打斷主畫面)
  //   ≤ 300m + 超速 → 升級整頁 CameraView (強制警告)
  const cameraNear = !!(nearbyCamera && camDist != null && camDist <= 800 && camAhead);
  const isOverSpeed = cameraNear && userSpeed != null && userSpeed > nearbyCamera.speedLimit;
  const cameraFullAlert = cameraNear && camDist <= 300 && isOverSpeed;

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
          {cameraFullAlert ? (
            <CameraView
              camera={{ ...nearbyCamera, distance: camDist }}
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
            />
          )}
          {cameraNear && !cameraFullAlert && (
            <CameraBanner
              camera={nearbyCamera}
              distance={camDist}
              userSpeed={userSpeed}
              isOverSpeed={isOverSpeed}
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
// 測速提醒 Banner — 800m 內浮在主畫面底部
// =====================================================
function CameraBanner({ camera, distance, userSpeed, isOverSpeed }) {
  const closeRange = distance <= 500;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isOverSpeed) { pulse.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 400, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isOverSpeed]);

  const baseBg = isOverSpeed ? '#3D0D0D' : closeRange ? '#2E0A0A' : '#2A1810';
  const borderColor = isOverSpeed ? '#FF3B30' : closeRange ? '#FF6B3B' : '#FFB340';
  const accent = isOverSpeed ? '#FF3B30' : closeRange ? '#FF6B3B' : '#FFB340';

  const bgAnim = isOverSpeed ? pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [baseBg, '#5C1010'],
  }) : baseBg;

  return (
    <Animated.View style={[s.cbWrap, { backgroundColor: bgAnim, borderColor }]}>
      {/* 左: 相機 icon */}
      <View style={s.cbIcon}>
        <View style={[s.cbIconBox, { borderColor: accent }]}>
          <View style={s.cbIconLens} />
        </View>
      </View>

      {/* 中: 限速 + 距離 */}
      <View style={s.cbMid}>
        <View style={[s.cbLimit, { borderColor: accent }]}>
          <Text style={s.cbLimitNum}>{camera.speedLimit}</Text>
        </View>
        <View style={s.cbDist}>
          <Text style={[s.cbDistNum, { color: accent }]}>{distance}</Text>
          <Text style={s.cbDistUnit}>m</Text>
        </View>
      </View>

      {/* 右: 你的速度（僅 ≤ 500m 顯示） */}
      {closeRange && userSpeed != null && (
        <View style={s.cbUser}>
          <Text style={[s.cbUserNum, { color: isOverSpeed ? '#FF3B30' : '#FFFFFF' }]}>
            {userSpeed}
          </Text>
          <Text style={s.cbUserUnit}>km/h</Text>
        </View>
      )}
    </Animated.View>
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
  const maxDist = 500;
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
              {/* 立桿 */}
              <View style={s.cvCamPole} />
              {/* 橫臂 */}
              <View style={s.cvCamArm} />
              {/* 相機箱遮光罩 */}
              <View style={s.cvCamHood} />
              {/* 相機箱體 */}
              <View style={s.cvCamBox} />
              {/* 閃光燈 */}
              <View style={s.cvCamFlash} />
              {/* 鏡頭 */}
              <View style={s.cvCamLens}>
                <View style={s.cvCamLensInner} />
              </View>
              {/* 紅外線光束 */}
              <View style={s.cvCamBeam1} />
              <View style={s.cvCamBeam2} />
              <View style={s.cvCamBeam3} />
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
  // 後端在路肩關閉時已濾掉路肩，所以這裡有回就顯示（代表開放）
  const mainLanes = (selfStation?.lanes || []);
  const advice = laneData?.advice;

  // 速度顏色 (使用者)
  const spNum = userSpeed != null ? userSpeed : 0;
  const userSpColor = spNum > 100 ? '#30D158' : spNum > 70 ? '#64D2FF' : spNum > 40 ? '#5E5CE6' : '#AEAEB2';

  return (
    <ScrollView style={s.hvScroll} contentContainerStyle={s.hvContent} showsVerticalScrollIndicator={false}>
      {/* ===== 上半：擬真道路 ===== */}
      <View style={s.hvStrip}>
        {withAvg.length === 0 ? (
          <Text style={s.hvEmpty}>前方路段資料載入中...</Text>
        ) : withAvg.map((st, i) => {
          const next = withAvg[i + 1];
          const e = eta(st);
          const userInSeg = !!(next && yourKm != null
            && yourKm >= Math.min(st.mileage, next.mileage)
            && yourKm <= Math.max(st.mileage, next.mileage));
          return (
            <Fragment key={st.vd_id || i}>
              {/* 站點橫列 */}
              <View style={s.rdStopRow}>
                <View style={s.rdLeftCol}>
                  <Text style={s.rdKm}>{Math.round(st.mileage)}K</Text>
                  {!!st.location && <Text style={s.rdIcName} numberOfLines={1}>{st.location}</Text>}
                </View>
                <View style={s.rdNodeCol}>
                  <View style={s.rdNodeLine} />
                  <View style={s.rdNode} />
                  <View style={s.rdNodeLine} />
                </View>
                <View style={s.rdRightCol}>
                  <Text style={s.rdEtaMin}>{e.min}分</Text>
                  <Text style={s.rdEtaKm}>{e.km} km</Text>
                </View>
              </View>
              {/* 道路段（連接下一站） */}
              {next && (
                <View style={s.rdSegRow}>
                  <View style={s.rdLeftCol} />
                  <View style={[s.rdRoad, { backgroundColor: segColor(st.avgSpeed) }]}>
                    <View style={s.rdDashCol}>
                      {[0, 1, 2].map(k => <View key={k} style={s.rdDash} />)}
                    </View>
                    {userInSeg && (
                      <View style={s.rdCar}>
                        <View style={s.rdCarBody} />
                        <View style={s.rdCarWindow} />
                      </View>
                    )}
                  </View>
                  <View style={s.rdRightCol}>
                    <Text style={s.rdSpeedNum}>{st.avgSpeed || '--'}</Text>
                    <Text style={s.rdSpeedUnit}>km/h</Text>
                  </View>
                </View>
              )}
            </Fragment>
          );
        })}
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
                → 建議 {advice.best_lane} (快 {Math.round(advice.speed_diff)})
              </Text>
            )}
          </View>
          <View style={s.lvRoad}>
            {mainLanes.map((lane, idx) => {
              const c = laneColor(lane.speed);
              const isBest = advice && lane.name === advice.best_lane;
              const stuck = lane.speed <= 1;
              return (
                <View
                  key={idx}
                  style={[s.lvLane, { backgroundColor: c.bg }]}
                >
                  {isBest && <View style={s.lvBestArrow} />}
                  <Text style={s.lvSpeed}>{stuck ? '!' : Math.round(lane.speed)}</Text>
                  <Text style={[s.lvName, { color: c.text }]}>{lane.name}</Text>
                  {idx < mainLanes.length - 1 && (
                    <View style={s.lvDashCol}>
                      {[0, 1, 2, 3, 4, 5].map(k => <View key={k} style={s.lvDash} />)}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
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

  // ===== CameraBanner (測速提醒) =====
  cbWrap: {
    position: 'absolute',
    left: 14, right: 14, bottom: 14,
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 16, borderWidth: 2,
    gap: 12,
  },
  cbIcon: { width: 44, alignItems: 'center' },
  cbIconBox: {
    width: 36, height: 28, borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0A0A10',
  },
  cbIconLens: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  cbMid: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cbLimit: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 3, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  cbLimitNum: { color: '#000000', fontSize: 20, fontWeight: '900' },
  cbDist: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  cbDistNum: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cbDistUnit: { color: '#FFFFFF', opacity: 0.7, fontSize: 14, fontWeight: '600' },
  cbUser: { alignItems: 'flex-end', minWidth: 72 },
  cbUserNum: { fontSize: 30, fontWeight: '800', lineHeight: 32, fontVariant: ['tabular-nums'] },
  cbUserUnit: { color: '#8E8E93', fontSize: 11, fontWeight: '500' },

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
    width: 80, height: 80, position: 'relative',
  },
  cvCamPole: {
    position: 'absolute', left: 10, top: 14, width: 5, height: 66,
    backgroundColor: '#5A6068', borderRadius: 1,
  },
  cvCamArm: {
    position: 'absolute', left: 14, top: 24, width: 14, height: 5,
    backgroundColor: '#5A6068', borderRadius: 1,
  },
  cvCamHood: {
    position: 'absolute', left: 28, top: 12, width: 38, height: 5,
    backgroundColor: '#1A1A22',
    borderTopLeftRadius: 2, borderTopRightRadius: 2,
  },
  cvCamBox: {
    position: 'absolute', left: 26, top: 16, width: 42, height: 28,
    backgroundColor: '#2C2C34',
    borderWidth: 1.5, borderColor: '#8E95A0',
    borderRadius: 3,
  },
  cvCamFlash: {
    position: 'absolute', left: 30, top: 21, width: 12, height: 16,
    backgroundColor: '#FFDC42', borderRadius: 1.5,
    borderWidth: 1, borderColor: '#A88820',
  },
  cvCamLens: {
    position: 'absolute', left: 49, top: 21, width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#0A0A10',
    borderWidth: 1.5, borderColor: '#8E95A0',
    alignItems: 'center', justifyContent: 'center',
  },
  cvCamLensInner: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: '#5A6068',
  },
  cvCamBeam1: {
    position: 'absolute', left: 70, top: 24, width: 8, height: 2,
    backgroundColor: '#FF3B30', borderRadius: 1,
  },
  cvCamBeam2: {
    position: 'absolute', left: 72, top: 30, width: 6, height: 2,
    backgroundColor: '#FF3B30', borderRadius: 1,
  },
  cvCamBeam3: {
    position: 'absolute', left: 70, top: 36, width: 8, height: 2,
    backgroundColor: '#FF3B30', borderRadius: 1,
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

  // 擬真道路
  rdStopRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34 },
  rdSegRow: { flexDirection: 'row', alignItems: 'stretch', minHeight: 78 },
  rdLeftCol: { flex: 1, paddingRight: 8, justifyContent: 'center' },
  rdRightCol: { flex: 1, paddingLeft: 8, justifyContent: 'center', alignItems: 'flex-end' },
  rdNodeCol: { width: 70, flexDirection: 'row', alignItems: 'center' },
  rdNodeLine: { flex: 1, height: 2, backgroundColor: '#FFFFFF', opacity: 0.45 },
  rdNode: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#FFC857',
    borderWidth: 2, borderColor: '#0F1930',
  },
  rdRoad: {
    width: 70,
    borderLeftWidth: 3, borderRightWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  rdDashCol: {
    position: 'absolute',
    top: 4, bottom: 4, left: '50%',
    width: 3, marginLeft: -1.5,
    justifyContent: 'space-around', alignItems: 'center',
  },
  rdDash: { width: 3, height: 12, backgroundColor: '#FFFFFF', opacity: 0.95 },

  // 車輛
  rdCar: {
    width: 28, height: 38,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  rdCarBody: {
    width: 28, height: 38,
    backgroundColor: '#0A84FF',
    borderRadius: 7,
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  rdCarWindow: {
    position: 'absolute', top: 7, alignSelf: 'center',
    width: 18, height: 14,
    backgroundColor: '#0F1930',
    borderRadius: 2,
  },

  // 文字
  rdKm: { color: '#FFC857', fontSize: 13, fontWeight: '800' },
  rdIcName: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginTop: 1 },
  rdEtaMin: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'right' },
  rdEtaKm: { color: '#8E8E93', fontSize: 11, marginTop: 1, textAlign: 'right' },
  rdSpeedNum: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', textAlign: 'right' },
  rdSpeedUnit: { color: '#FFFFFF', opacity: 0.7, fontSize: 10, marginTop: -1, textAlign: 'right' },

  // 下半：俯視車道
  hvLanes: { marginTop: 18 },
  hvLanesHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  hvLanesHeader: { color: '#8E8E93', fontSize: 13 },
  hvAdviceHint: { color: '#BDB6FF', fontSize: 12, fontWeight: '600' },
  lvRoad: {
    flexDirection: 'row',
    borderLeftWidth: 3, borderRightWidth: 3, borderColor: '#FFFFFF',
    borderRadius: 6,
    height: 130,
    overflow: 'hidden',
    backgroundColor: '#0F0F14',
  },
  lvLane: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  lvBestArrow: {
    position: 'absolute', top: 6, alignSelf: 'center',
    width: 0, height: 0,
    borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 11,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: '#30D158',
  },
  lvSpeed: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  lvName: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  lvDashCol: {
    position: 'absolute',
    top: 0, bottom: 0, right: 0,
    width: 2,
    justifyContent: 'space-around', alignItems: 'center',
  },
  lvDash: { width: 2, height: 14, backgroundColor: '#FFFFFF', opacity: 0.85 },

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
