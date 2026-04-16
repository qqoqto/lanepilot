import { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';
import * as Location from 'expo-location';
import { API_BASE, COLORS, getLaneColor } from '../constants';
import { useSettings } from '../SettingsContext';
import { findNearbyCamera, initSpeedCameras } from '../data/speedCameras';
import {
  announceCamera, announceLaneAdvice, announceBottleneck,
  announcePrediction, announceHighwayEntry, announceHighwayExit,
  updateSpeedHistory, setVoiceEnabled, isVoiceEnabled,
} from '../utils/voiceCoach';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// =====================================================
// 交流道里程對照表
// =====================================================
const INTERCHANGES = {
  '1': [
    { name: '基隆端', km: 0 }, { name: '基隆', km: 2.5 }, { name: '八堵', km: 5.2 },
    { name: '大華系統', km: 8.3 }, { name: '五堵', km: 10.3 }, { name: '汐止', km: 12.4 },
    { name: '汐止系統', km: 14.2 }, { name: '東湖', km: 17.2 }, { name: '內湖', km: 20.3 },
    { name: '圓山', km: 23.5 }, { name: '台北', km: 25.4 }, { name: '三重', km: 28.6 },
    { name: '五股', km: 32.4 }, { name: '五股轉接', km: 33.5 }, { name: '林口', km: 41.4 },
    { name: '機場系統', km: 45.6 }, { name: '桃園', km: 52 }, { name: '中壢', km: 62 },
    { name: '內壢', km: 64.4 }, { name: '楊梅', km: 69 }, { name: '幼獅', km: 72.5 },
    { name: '湖口', km: 83 }, { name: '竹北', km: 91 }, { name: '新竹', km: 95.3 },
    { name: '新竹系統', km: 99.2 }, { name: '頭份', km: 110.5 }, { name: '頭屋', km: 118.3 },
    { name: '苗栗', km: 132 }, { name: '銅鑼', km: 140.6 }, { name: '三義', km: 150.7 },
    { name: '后里', km: 157 }, { name: '豐原', km: 165.5 }, { name: '台中系統', km: 169 },
    { name: '大雅', km: 174 }, { name: '台中', km: 178.5 }, { name: '南屯', km: 183.2 },
    { name: '彰化系統', km: 192 }, { name: '彰化', km: 198.5 }, { name: '埔鹽系統', km: 206 },
    { name: '員林', km: 211.8 }, { name: '北斗', km: 220.8 }, { name: '西螺', km: 230.8 },
    { name: '斗南', km: 240 }, { name: '大林', km: 250.2 }, { name: '民雄', km: 259 },
    { name: '嘉義', km: 264 }, { name: '水上', km: 272 }, { name: '新營', km: 288.4 },
    { name: '麻豆', km: 295.5 }, { name: '安定', km: 305 }, { name: '台南系統', km: 309 },
    { name: '永康', km: 315 }, { name: '仁德系統', km: 319 }, { name: '路竹', km: 328.3 },
    { name: '岡山', km: 335.5 }, { name: '楠梓', km: 343.5 }, { name: '鼎金系統', km: 349.5 },
    { name: '高雄', km: 357 },
  ],
  '3': [
    { name: '基金', km: 0 }, { name: '汐止系統', km: 11.5 }, { name: '新台五', km: 14.8 },
    { name: '南港系統', km: 19 }, { name: '南港', km: 21.5 }, { name: '木柵', km: 27 },
    { name: '新店', km: 32 }, { name: '安坑', km: 36.2 }, { name: '中和', km: 39 },
    { name: '土城', km: 42.5 }, { name: '三鶯', km: 50 }, { name: '鶯歌系統', km: 55 },
    { name: '大溪', km: 62 }, { name: '龍潭', km: 67 }, { name: '關西', km: 79 },
    { name: '竹林', km: 85 }, { name: '寶山', km: 100 }, { name: '茄苳', km: 103 },
    { name: '香山', km: 108 }, { name: '西濱', km: 119 }, { name: '竹南', km: 140 },
    { name: '後龍', km: 152 }, { name: '通霄', km: 161 }, { name: '苑裡', km: 176 },
    { name: '大甲', km: 185 }, { name: '中港系統', km: 195 }, { name: '沙鹿', km: 200 },
    { name: '龍井', km: 205 }, { name: '和美', km: 210 }, { name: '彰化系統', km: 216 },
    { name: '快官', km: 220 }, { name: '草屯', km: 235 }, { name: '霧峰系統', km: 243 },
    { name: '南投', km: 258 }, { name: '名間', km: 266 }, { name: '竹山', km: 280 },
    { name: '斗六', km: 290 }, { name: '古坑', km: 300 }, { name: '梅山', km: 310 },
    { name: '中埔', km: 320 }, { name: '白河', km: 340 }, { name: '官田系統', km: 355 },
    { name: '善化', km: 360 }, { name: '新化系統', km: 370 }, { name: '關廟', km: 380 },
    { name: '田寮', km: 390 }, { name: '燕巢系統', km: 400 },
  ],
  '5': [
    { name: '南港系統', km: 0 }, { name: '石碇', km: 10.9 }, { name: '坪林', km: 22 },
    { name: '頭城', km: 39.2 }, { name: '宜蘭', km: 46.5 }, { name: '羅東', km: 48.2 },
    { name: '蘇澳', km: 54.3 },
  ],
  '1H': [
    { name: '汐止端', km: 12.7 }, { name: '五股轉接', km: 19.3 },
    { name: '中和', km: 24 }, { name: '板橋', km: 26 }, { name: '中壢端', km: 33 },
  ],
  '2': [
    { name: '桃園', km: 0 }, { name: '南桃園', km: 4 }, { name: '大湳', km: 7.2 },
    { name: '鶯歌系統', km: 15.5 }, { name: '機場端', km: 20.3 },
  ],
  '4': [
    { name: '清水端', km: 0 }, { name: '神岡', km: 7.4 }, { name: '潭子系統', km: 12 },
    { name: '豐原端', km: 17.7 },
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

function findNearestInterchange(road, km) {
  const list = INTERCHANGES[road];
  if (!list || !list.length) return null;
  let nearest = list[0], minDist = Math.abs(list[0].km - km);
  for (const ic of list) {
    const d = Math.abs(ic.km - km);
    if (d < minDist) { minDist = d; nearest = ic; }
  }
  return nearest;
}

function groupByInterchange(stations, roadId, direction) {
  const icList = INTERCHANGES[roadId];
  if (!icList || !icList.length || !stations.length) return [];

  // 根據方向排序交流道
  const isNorth = direction === '北向';
  const sortedIcs = [...icList].sort((a, b) => isNorth ? b.km - a.km : a.km - b.km);

  // 把 VD 站歸到最近的交流道區間
  const sections = [];
  for (let i = 0; i < sortedIcs.length - 1; i++) {
    const fromIc = sortedIcs[i];
    const toIc = sortedIcs[i + 1];
    const kmLo = Math.min(fromIc.km, toIc.km);
    const kmHi = Math.max(fromIc.km, toIc.km);
    const sectionStations = stations.filter(s => {
      const m = s.mileage;
      return m >= kmLo && m <= kmHi;
    });
    if (sectionStations.length === 0) continue;

    const mainLanes = sectionStations.flatMap(s =>
      (s.lanes || []).filter(l => !l.is_shoulder && l.speed > 0)
    );
    const avgSpeed = mainLanes.length > 0
      ? Math.round(mainLanes.reduce((sum, l) => sum + l.speed, 0) / mainLanes.length) : 0;
    const dist = Math.abs(toIc.km - fromIc.km);
    const estMin = avgSpeed > 0 ? Math.round(dist / avgSpeed * 60) : 0;

    // 取區間中間站的車道資料（展開用）
    const midStation = sectionStations[Math.floor(sectionStations.length / 2)];
    const laneSpeeds = (midStation?.lanes || []).filter(l => !l.is_shoulder).map(l => ({
      name: l.name, speed: l.speed,
    }));

    let level, color;
    if (avgSpeed > 80) { level = '順暢'; color = '#1D9E75'; }
    else if (avgSpeed >= 40) { level = '車多'; color = '#BA7517'; }
    else { level = '壅塞'; color = '#E24B4A'; }

    sections.push({
      from: fromIc.name, to: toIc.name,
      fromKm: fromIc.km, toKm: toIc.km,
      dist: Math.round(dist * 10) / 10,
      avgSpeed, estMin, level, color, laneSpeeds,
      stationCount: sectionStations.length,
    });
  }
  return sections;
}

// =====================================================
// 駕駛模式主頁
// =====================================================
// 帶重試的 fetch，處理伺服器冷啟動/暫時不可用
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

export default function RealtimeScreen() {
  const { sensitivity } = useSettings();
  const [gpsData, setGpsData] = useState(null);
  const [laneData, setLaneData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const prevLanesRef = useRef({});
  const [expandedSection, setExpandedSection] = useState(null);
  const [userSpeed, setUserSpeed] = useState(null);           // GPS 速度 (km/h)
  const [currentLane, setCurrentLane] = useState(null);       // 推測/手動選的車道名稱
  const [laneManualOverride, setLaneManualOverride] = useState(false); // 是否手動選過
  const [nearbyCamera, setNearbyCamera] = useState(null);     // 附近測速照相
  const [userCoords, setUserCoords] = useState(null);         // GPS 座標
  const [userAltitude, setUserAltitude] = useState(null);     // GPS 海拔 (公尺)
  const [voiceOn, setVoiceOn] = useState(true);               // 語音開關
  const wasOnHighwayRef = useRef(false);                      // 追蹤上次是否在國道上

  const fetchAll = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError('GPS 權限未授權');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude, speed: gpsSpeed, altitude: gpsAltitude } = loc.coords;
      // GPS speed 是 m/s，轉成 km/h；靜止或無效時為 null
      const speedKmh = (gpsSpeed != null && gpsSpeed >= 0) ? Math.round(gpsSpeed * 3.6) : null;
      const altMeters = (gpsAltitude != null && gpsAltitude >= 0) ? Math.round(gpsAltitude) : null;
      setUserSpeed(speedKmh);
      setUserCoords({ latitude, longitude });
      setUserAltitude(altMeters);

      // 首次取得座標時，預載全台測速照相資料
      initSpeedCameras(latitude, longitude);

      setApiError(null);
      setGpsError(null);
      const nearbyResp = await fetchWithRetry(
        `${API_BASE}/api/v1/nearby?lat=${latitude}&lon=${longitude}`
      );
      if (!nearbyResp.ok) {
        // 無法取得路況時，不帶過濾偵測測速照相
        setNearbyCamera(findNearbyCamera(latitude, longitude));
        setApiError('目前無法取得路況資料，請稍後再試');
        return;
      }
      const nearbyJson = await nearbyResp.json();
      setGpsData(nearbyJson);

      const { road, direction, mileage, distance_km } = nearbyJson.nearest || {};
      // 測速照相偵測：在國道上時只比對同路線同方向，避免高架/平面誤報
      const dirLabel_ = direction === 'N' ? '北向' : direction === 'S' ? '南向' : null;
      if (road && distance_km != null && distance_km <= 1) {
        setNearbyCamera(findNearbyCamera(latitude, longitude, { road, direction: dirLabel_, altitude: altMeters }));
      } else {
        // 不在國道上，不顯示國道測速照相（避免平面路收到高架的提醒）
        setNearbyCamera(null);
      }
      if (road && direction && mileage) {
        const speedParam = speedKmh != null ? `&speed=${speedKmh}` : '';
        const laneResp = await fetchWithRetry(
          `${API_BASE}/api/v1/lanes/realtime?road=${road}&dir=${direction}&km=${mileage}${speedParam}`
        );
        if (laneResp.ok) {
          const laneJson = await laneResp.json();
          if (laneData?.lanes) {
            const prev = {};
            laneData.lanes.forEach(l => { prev[l.name] = l.speed; });
            prevLanesRef.current = prev;
          }
          setLaneData(laneJson);
          // 自動偵測車道（如果使用者沒有手動選過）
          const estimatedLane = (!laneManualOverride && laneJson.estimated_lane?.confidence !== 'low')
            ? (laneJson.estimated_lane?.lane_name || null) : currentLane;
          if (!laneManualOverride && laneJson.estimated_lane?.confidence !== 'low') {
            setCurrentLane(estimatedLane);
          }

          // === 語音教練 ===
          const mainLanes_ = (laneJson.lanes || []).filter(l => !l.is_shoulder);
          updateSpeedHistory(mainLanes_);
          // 預測式：偵測車道減速趨勢
          if (!announcePrediction(mainLanes_, estimatedLane)) {
            // 沒有預測播報時，才播車道建議
            announceLaneAdvice(laneJson.advice, estimatedLane, sensitivity);
          }
        }
      }

      // 語音：進入/離開國道偵測
      const onHighway = road && distance_km != null && distance_km <= 1;
      const roadFullName = nearbyJson.road || '';
      if (onHighway && !wasOnHighwayRef.current) {
        announceHighwayEntry(roadFullName, dirLabel_);
      } else if (!onHighway && wasOnHighwayRef.current) {
        announceHighwayExit();
      }
      wasOnHighwayRef.current = onHighway;

      // 語音：壅塞預警
      const bns = nearbyJson.bottlenecks || [];
      if (bns.length > 0) announceBottleneck(bns);

      setCountdown(30);
    } catch (e) {
      if (!gpsData) setApiError('網路連線異常，請確認網路後下拉重新整理');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    const timer = setInterval(() => setCountdown(prev => prev > 0 ? prev - 1 : 0), 1000);
    return () => clearInterval(timer);
  }, []);

  // 語音：測速照相提醒（當 nearbyCamera 變化時）
  useEffect(() => {
    if (nearbyCamera) announceCamera(nearbyCamera, userSpeed);
  }, [nearbyCamera?.distance]);

  // 高頻 GPS 更新（時速表用，每 2 秒）
  // 測速照相偵測由 fetchAll 處理（有路線資訊可精確過濾）
  useEffect(() => {
    let sub = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
        (loc) => {
          const { latitude, longitude, speed: gpsSpeed, altitude: gpsAlt } = loc.coords;
          const speedKmh = (gpsSpeed != null && gpsSpeed >= 0) ? Math.round(gpsSpeed * 3.6) : null;
          setUserSpeed(speedKmh);
          setUserCoords({ latitude, longitude });
          setUserAltitude((gpsAlt != null && gpsAlt >= 0) ? Math.round(gpsAlt) : null);
        }
      );
    })();
    return () => { if (sub) sub.remove(); };
  }, []);

  // 解析資料
  const road = gpsData?.nearest?.road;
  const yourKm = gpsData?.your_km;
  const ic = road && yourKm ? findNearestInterchange(road, yourKm) : null;
  const dirLabel = gpsData?.direction;
  const roadName = gpsData?.road;
  const distKm = gpsData?.nearest?.distance_km;

  const lanes = laneData?.lanes || [];
  const mainLanes = lanes.filter(l => !l.is_shoulder);
  const advice = laneData?.advice;
  const diff = advice?.speed_diff || 0;
  const isHold = diff < sensitivity;
  const isStrong = diff >= 30;

  const bottlenecks = gpsData?.bottlenecks || [];
  const summary = gpsData?.summary;
  const nearbyRoads = gpsData?.nearby_roads || [];
  const isOnHighway = gpsData && distKm != null && distKm <= 1;

  return (
    <ScrollView
      style={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={COLORS.green} />}
    >
      {/* ============ GPS 定位條 ============ */}
      <View style={styles.topBar}>
        <View style={[styles.gpsDot, gpsData && styles.gpsDotActive]} />
        <Text style={styles.topBarText}>
          {loading ? '定位中...' : gpsData
            ? `${roadName} ${dirLabel} ${yourKm}K · 距${distKm}km`
            : '等待 GPS 定位'}
        </Text>
        {gpsData && <Text style={styles.topBarCountdown}>{countdown}s</Text>}
        <TouchableOpacity
          style={styles.voiceToggle}
          onPress={() => { const next = !voiceOn; setVoiceOn(next); setVoiceEnabled(next); }}
        >
          <Text style={styles.voiceToggleText}>{voiceOn ? '🔊' : '🔇'}</Text>
        </TouchableOpacity>
      </View>

      {/* ============ 載入/錯誤狀態 ============ */}
      {loading && (
        <View style={styles.centerBox}>
          <Text style={styles.centerIcon}>📡</Text>
          <Text style={styles.centerTitle}>GPS 定位中...</Text>
        </View>
      )}
      {gpsError && !loading && (
        <View style={styles.centerBox}>
          <Text style={styles.centerIcon}>📍</Text>
          <Text style={styles.centerTitle}>{gpsError}</Text>
          <Text style={styles.centerHint}>到「路段」分頁可手動查詢</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); setGpsError(null); fetchAll(); }}>
            <Text style={styles.retryText}>重新定位</Text>
          </TouchableOpacity>
        </View>
      )}
      {apiError && !loading && (
        <View style={styles.centerBox}>
          <Text style={styles.centerIcon}>📶</Text>
          <Text style={styles.centerTitle}>{apiError}</Text>
          <Text style={styles.centerHint}>也可以到「路段」分頁手動查詢路況</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); setApiError(null); fetchAll(); }}>
            <Text style={styles.retryText}>重新載入</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ============ 測速照相提醒（全域） ============ */}
      {nearbyCamera && !loading && (() => {
        const isOver = userSpeed != null && userSpeed > nearbyCamera.speedLimit;
        return (
          <View style={[styles.cameraAlert, isOver && styles.cameraAlertOver]}>
            <View style={[styles.cameraIconCircle, isOver && styles.cameraIconCircleOver]}>
              <Text style={styles.cameraAlertIcon}>{isOver ? '!' : '+'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cameraAlertTitle, isOver && { color: '#ff6b6b' }]}>
                測速照相 {nearbyCamera.distance}m
              </Text>
              <Text style={styles.cameraAlertSub}>
                限速 {nearbyCamera.speedLimit} · {nearbyCamera.name}
              </Text>
            </View>
            <View style={[styles.cameraLimitBadge, isOver && styles.cameraLimitBadgeOver]}>
              <Text style={[styles.cameraLimitNum, isOver && { color: '#ff4040' }]}>{nearbyCamera.speedLimit}</Text>
              <Text style={styles.cameraLimitUnit}>km/h</Text>
            </View>
          </View>
        );
      })()}

      {/* ============ 非國道模式：大字時速表 ============ */}
      {gpsData && !loading && !isOnHighway && (() => {
        const speed = userSpeed != null ? userSpeed : 0;
        const speedColor = speed > 110 ? '#FF3B30' : speed > 60 ? '#FFFFFF' : '#8E8E93';
        const ringSize = Math.min(SCREEN_WIDTH - 80, 280);
        const accentBlue = '#0A84FF';
        return (
          <>
            <View style={styles.speedometerContainer}>
              {/* 圓形速度面板 */}
              <View style={[styles.speedRing, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}>
                <View style={[styles.speedRingInner, {
                  width: ringSize - 8, height: ringSize - 8, borderRadius: (ringSize - 8) / 2,
                  borderColor: speed > 110 ? '#FF3B3040' : accentBlue + '25',
                }]}>
                  <View style={[styles.speedRingCore, {
                    width: ringSize - 24, height: ringSize - 24, borderRadius: (ringSize - 24) / 2,
                  }]}>
                    <Text style={[styles.speedometerValue, { color: speedColor }]}>
                      {userSpeed != null ? userSpeed : '--'}
                    </Text>
                    <Text style={styles.speedometerUnit}>km/h</Text>
                  </View>
                </View>
              </View>

              {/* 速度刻度 */}
              <View style={styles.speedIndicatorRow}>
                {[0, 30, 60, 90, 120].map(v => (
                  <View key={v} style={styles.speedIndicatorItem}>
                    <View style={[
                      styles.speedIndicatorBar,
                      speed >= v && { backgroundColor: speed > 110 ? '#FF3B30' : accentBlue },
                    ]} />
                    <Text style={[styles.speedIndicatorText, speed >= v && { color: '#98989D' }]}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={styles.footer}>每 30 秒更新</Text>
          </>
        );
      })()}

      {/* ============ 主要內容（國道模式） ============ */}
      {gpsData && !loading && isOnHighway && (
        <>
          {/* — 位置標題 — */}
          <View style={styles.locationRow}>
            <Text style={styles.locationTitle}>
              {ic ? `近 ${ic.name}交流道` : `${yourKm}K`}
            </Text>
            <Text style={styles.locationRoad}>{roadName} {dirLabel}</Text>
          </View>

          {/* — 核心：車道建議（最大區塊） — */}
          {advice && (
            <View style={[styles.adviceCard, {
              backgroundColor: isHold ? '#1a2a22' : isStrong ? '#0B5E3F' : '#1A4A35',
              borderLeftColor: isHold ? COLORS.dimGray : COLORS.green,
            }]}>
              <Text style={styles.adviceEmoji}>
                {isHold ? '✓' : isStrong ? '⇒' : '→'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.adviceMainText, isStrong && styles.adviceMainTextStrong]}>
                  {isHold
                    ? (currentLane ? `在${currentLane}，維持車道` : '維持車道')
                    : (currentLane
                      ? (isStrong ? `${currentLane} → ${advice.best_lane}` : `考慮 ${currentLane} → ${advice.best_lane}`)
                      : (isStrong ? `切 ${advice.best_lane}` : `考慮 ${advice.best_lane}`)
                    )
                  }
                </Text>
                {currentLane && !isHold && (
                  <Text style={styles.adviceSubText}>
                    {advice.best_lane} 快 {Math.round(diff)} km/h
                  </Text>
                )}
              </View>
              {!isHold && !currentLane && (
                <Text style={styles.adviceDiffText}>
                  快 {Math.round(diff)} km/h
                </Text>
              )}
            </View>
          )}

          {/* — 車道速度色塊（點擊可手動選擇所在車道） — */}
          {mainLanes.length > 0 && (
            <View style={styles.lanesRow}>
              {mainLanes.map((lane, idx) => {
                const c = getLaneColor(lane.speed);
                const isBest = advice && lane.name === advice.best_lane;
                const isCurrent = currentLane === lane.name;
                const isStuck = lane.speed <= 1;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.laneBlock,
                      { backgroundColor: c.bg },
                      isCurrent && styles.laneBlockCurrent,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setCurrentLane(lane.name);
                      setLaneManualOverride(true);
                    }}
                  >
                    {isBest && !isCurrent && <View style={styles.bestDot} />}
                    {isCurrent && <Text style={styles.currentLaneTag}>你在這</Text>}
                    <Text style={[styles.laneLabel, { color: c.text }]}>{lane.name}</Text>
                    <Text style={styles.laneSpeedBig}>{isStuck ? '!' : Math.round(lane.speed)}</Text>
                    <Text style={[styles.laneSpeedUnit, { color: c.text }]}>
                      {isStuck ? '靜止' : 'km/h'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {/* — GPS 速度 + 車道定位提示 — */}
          {mainLanes.length > 0 && (
            <View style={styles.laneHintRow}>
              {userSpeed != null && <Text style={styles.laneHintText}>你的車速 {userSpeed} km/h</Text>}
              {currentLane && (
                <TouchableOpacity onPress={() => { setCurrentLane(null); setLaneManualOverride(false); }}>
                  <Text style={styles.laneResetText}>重設車道</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* — 路肩（如果有） — */}
          {lanes.filter(l => l.is_shoulder).map((lane, idx) => (
            <View key={`sh-${idx}`} style={styles.shoulderRow}>
              <Text style={styles.shoulderLabel}>路肩</Text>
              <Text style={styles.shoulderSpeed}>{Math.round(lane.speed)} km/h</Text>
              {lane.shoulder_speed_limit && (
                <Text style={styles.shoulderLimit}>限速 {lane.shoulder_speed_limit}</Text>
              )}
            </View>
          ))}

          {/* — 前方瓶頸（有才顯示） — */}
          {bottlenecks.length > 0 && (
            <View style={styles.bnSection}>
              <Text style={styles.bnSectionTitle}>⚠ 前方 {bottlenecks.length} 處壅塞</Text>
              {bottlenecks.map((bn, idx) => (
                <View key={idx} style={styles.bnItem}>
                  <Text style={styles.bnItemText}>
                    {bn.worst_lane} 降至 {Math.round(bn.worst_speed)} km/h
                  </Text>
                  <Text style={styles.bnItemSub}>
                    {bn.start} → {bn.end}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* — 摘要三格 — */}
          {summary && (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{summary.est_minutes}</Text>
                <Text style={styles.statLabel}>分鐘</Text>
              </View>
              <View style={[styles.statItem, styles.statItemMiddle]}>
                <Text style={[styles.statVal, summary.bottleneck_count > 0 && { color: COLORS.yellow }]}>
                  {summary.bottleneck_count}
                </Text>
                <Text style={styles.statLabel}>瓶頸</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{summary.avg_speed}</Text>
                <Text style={styles.statLabel}>均速</Text>
              </View>
            </View>
          )}

          {/* — 前方路況（交流道區間） — */}
          {gpsData.stations?.length > 0 && (() => {
            const roadId = gpsData?.nearest?.road;
            const sections = groupByInterchange(gpsData.stations, roadId, dirLabel);
            if (sections.length === 0) return null;
            return (
              <View style={styles.routeSection}>
                <Text style={styles.routeSectionTitle}>前方路況</Text>
                {sections.slice(0, 8).map((sec, idx) => {
                  const isExpanded = expandedSection === idx;
                  const barWidth = Math.max(15, Math.min(100, sec.avgSpeed / 110 * 100));
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={styles.routeCard}
                      onPress={() => setExpandedSection(isExpanded ? null : idx)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.routeCardHeader}>
                        <View style={styles.routeCardLeft}>
                          <View style={[styles.routeDot, { backgroundColor: sec.color }]} />
                          <Text style={styles.routeIcName}>{sec.from}</Text>
                        </View>
                        <Text style={styles.routeEst}>{sec.estMin}分 · {sec.dist}km</Text>
                      </View>
                      <View style={styles.routeBarRow}>
                        <View style={styles.routeBarBg}>
                          <View style={[styles.routeBarFill, { width: `${barWidth}%`, backgroundColor: sec.color }]} />
                        </View>
                        <Text style={[styles.routeSpeedText, { color: sec.color }]}>{sec.avgSpeed}</Text>
                        <Text style={[styles.routeLevelText, { color: sec.color }]}>{sec.level}</Text>
                      </View>
                      {isExpanded && sec.laneSpeeds.length > 0 && (
                        <View style={styles.routeLanesRow}>
                          {sec.laneSpeeds.map((lane, li) => {
                            const lc = getLaneColor(lane.speed);
                            return (
                              <View key={li} style={[styles.routeLaneBlock, { backgroundColor: lc.bg }]}>
                                <Text style={[styles.routeLaneName, { color: lc.text }]}>{lane.name}</Text>
                                <Text style={styles.routeLaneSpeed}>{Math.round(lane.speed)}</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                      {isExpanded && sec.laneSpeeds.length > 0 && sec.laneSpeeds.length >= 2 && (() => {
                        const best = sec.laneSpeeds.reduce((a, b) => a.speed > b.speed ? a : b);
                        const worst = sec.laneSpeeds.reduce((a, b) => a.speed < b.speed ? a : b);
                        const diff = best.speed - worst.speed;
                        if (diff < sensitivity) return null;
                        return (
                          <View style={styles.routeAdviceRow}>
                            <Text style={styles.routeAdviceText}>
                              建議走 {best.name}，快 {Math.round(diff)} km/h
                            </Text>
                          </View>
                        );
                      })()}
                    </TouchableOpacity>
                  );
                })}
                {sections.length > 8 && (
                  <Text style={styles.routeMore}>... 還有 {sections.length - 8} 段</Text>
                )}
              </View>
            );
          })()}

          <Text style={styles.footer}>每 30 秒更新 · 交通部即時資料</Text>
        </>
      )}
    </ScrollView>
  );
}

// =====================================================
// 樣式 - 駕駛模式：大字、高對比、少資訊
// =====================================================
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#000000' },

  // 頂部 GPS 條
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    backgroundColor: '#1C1C1E',
  },
  gpsDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3A3A3C' },
  gpsDotActive: { backgroundColor: '#30D158' },
  topBarText: { flex: 1, color: '#8E8E93', fontSize: 12 },
  topBarCountdown: { color: '#48484A', fontSize: 11 },
  voiceToggle: { paddingHorizontal: 8, paddingVertical: 4 },
  voiceToggleText: { fontSize: 16 },

  // 載入/錯誤
  centerBox: { alignItems: 'center', paddingVertical: 100, paddingHorizontal: 40 },
  centerIcon: { fontSize: 48, marginBottom: 16 },
  centerTitle: { color: '#E5E5EA', fontSize: 18, fontWeight: '500', textAlign: 'center' },
  centerHint: { color: '#636366', fontSize: 13, marginTop: 8, textAlign: 'center' },
  retryBtn: { marginTop: 24, backgroundColor: '#0A84FF20', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  retryText: { color: '#0A84FF', fontSize: 14, fontWeight: '600' },

  // 位置標題
  locationRow: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  locationTitle: { color: '#fff', fontSize: 24, fontWeight: '700', letterSpacing: 0.5 },
  locationRoad: { color: '#777', fontSize: 13, marginTop: 2 },

  // ===== 核心建議卡片 =====
  adviceCard: {
    marginHorizontal: 16, marginTop: 16, marginBottom: 16,
    borderRadius: 16, padding: 20,
    borderLeftWidth: 5,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  adviceEmoji: { fontSize: 28, color: '#fff', width: 36, textAlign: 'center' },
  adviceMainText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  adviceMainTextStrong: { color: '#5DFFC1', fontSize: 30 },
  adviceSubText: { color: '#5DCAA5', fontSize: 13, marginTop: 4 },
  adviceDiffText: {
    color: '#5DCAA5', fontSize: 14, fontWeight: '600',
    backgroundColor: '#0a3d2d', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    overflow: 'hidden',
  },

  // ===== 車道色塊 =====
  lanesRow: {
    flexDirection: 'row', paddingHorizontal: 12, gap: 6,
    marginBottom: 12,
  },
  laneBlock: {
    flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    minHeight: 100,
    justifyContent: 'center',
  },
  laneBlockCurrent: {
    borderWidth: 2, borderColor: '#5DCAA5',
  },
  currentLaneTag: {
    position: 'absolute', top: 6,
    color: '#5DCAA5', fontSize: 9, fontWeight: '700',
  },
  bestDot: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#5DCAA5',
  },
  laneLabel: { fontSize: 12, marginBottom: 4, fontWeight: '500' },
  laneSpeedBig: { color: '#fff', fontSize: 36, fontWeight: '700' },
  laneSpeedUnit: { fontSize: 11, marginTop: 2 },

  // 車道定位提示
  laneHintRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 12,
  },
  laneHintText: { color: '#555', fontSize: 11 },
  laneResetText: { color: '#5DCAA5', fontSize: 11 },

  // 路肩
  shoulderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#1a1a1e', borderRadius: 10, padding: 10,
  },
  shoulderLabel: { color: '#888', fontSize: 12 },
  shoulderSpeed: { color: '#aaa', fontSize: 14, fontWeight: '600' },
  shoulderLimit: { color: '#666', fontSize: 11 },

  // 距離遠
  farBanner: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#2a2400', borderRadius: 10, padding: 10,
  },
  farText: { color: '#dda', fontSize: 12, textAlign: 'center' },

  // ===== 附近國道路況 =====
  nearbySection: {
    marginHorizontal: 16, marginTop: 4, marginBottom: 12,
  },
  nearbySectionTitle: {
    color: '#8E8E93', fontSize: 13, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  nearbyCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14,
    marginBottom: 8,
  },
  nearbyDotLine: { width: 3, height: '80%', borderRadius: 1.5, marginRight: 12 },
  nearbyCardLeft: { flex: 1 },
  nearbyRoadName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  nearbyIcName: { color: '#8E8E93', fontSize: 12, marginTop: 3 },
  nearbyDistance: { color: '#636366', fontSize: 11, marginTop: 3 },
  nearbyCardRight: { alignItems: 'flex-end' },
  nearbySpeedBadge: {
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'baseline', gap: 3,
  },
  nearbySpeed: { fontSize: 24, fontWeight: '700' },
  nearbySpeedUnit: { fontSize: 11 },
  nearbyLevel: { fontSize: 10, fontWeight: '600', marginTop: 3, letterSpacing: 0.5 },

  // ===== 瓶頸 =====
  bnSection: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 12,
    backgroundColor: '#1e0e0e', borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: '#4a1a1a',
  },
  bnSectionTitle: { color: '#f09595', fontSize: 15, fontWeight: '600', marginBottom: 10 },
  bnItem: { marginBottom: 8 },
  bnItemText: { color: '#faa', fontSize: 14, fontWeight: '500' },
  bnItemSub: { color: '#755', fontSize: 11, marginTop: 2 },

  // ===== 摘要三格 =====
  statsRow: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 8, marginBottom: 16,
    backgroundColor: '#151518', borderRadius: 14, overflow: 'hidden',
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statItemMiddle: { borderLeftWidth: 0.5, borderRightWidth: 0.5, borderColor: '#2a2a2e' },
  statVal: { color: '#fff', fontSize: 22, fontWeight: '700' },
  statLabel: { color: '#666', fontSize: 10, marginTop: 4 },

  // ===== 前方路況（交流道區間） =====
  routeSection: { paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  routeSectionTitle: { color: '#999', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  routeCard: {
    backgroundColor: '#151518', borderRadius: 14, padding: 14,
    marginBottom: 8,
  },
  routeCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  routeCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeIcName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  routeEst: { color: '#777', fontSize: 12 },
  routeBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeBarBg: {
    flex: 1, height: 8, backgroundColor: '#2a2a2e', borderRadius: 4, overflow: 'hidden',
  },
  routeBarFill: { height: 8, borderRadius: 4 },
  routeSpeedText: { fontSize: 16, fontWeight: '700', width: 32, textAlign: 'right' },
  routeLevelText: { fontSize: 11, width: 28 },
  routeLanesRow: {
    flexDirection: 'row', gap: 6, marginTop: 12, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: '#2a2a2e',
  },
  routeLaneBlock: {
    flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  routeLaneName: { fontSize: 10, marginBottom: 3 },
  routeLaneSpeed: { color: '#fff', fontSize: 20, fontWeight: '700' },
  routeAdviceRow: {
    marginTop: 8, backgroundColor: '#0a3d2d', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  routeAdviceText: { color: '#5DCAA5', fontSize: 12, fontWeight: '500' },
  routeMore: { color: '#444', fontSize: 11, textAlign: 'center', paddingVertical: 8 },

  footer: { color: '#3A3A3C', fontSize: 9, textAlign: 'center', paddingVertical: 20 },

  // ===== 測速照相提醒 =====
  cameraAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#1C1C1E', borderRadius: 14, padding: 14,
  },
  cameraAlertOver: {
    backgroundColor: '#2C1215',
  },
  cameraIconCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#FF9F0A20', alignItems: 'center', justifyContent: 'center',
  },
  cameraIconCircleOver: { backgroundColor: '#FF3B3025' },
  cameraAlertIcon: { color: '#FF9F0A', fontSize: 18, fontWeight: '800' },
  cameraAlertTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  cameraAlertSub: { color: '#8E8E93', fontSize: 12, marginTop: 2 },
  cameraLimitBadge: {
    alignItems: 'center', backgroundColor: '#2C2C2E', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6, minWidth: 52,
  },
  cameraLimitBadgeOver: { backgroundColor: '#3A1518' },
  cameraLimitNum: { color: '#FF9F0A', fontSize: 22, fontWeight: '700' },
  cameraLimitUnit: { color: '#636366', fontSize: 9, marginTop: 1 },

  // ===== 非國道時速表 =====
  speedometerContainer: {
    alignItems: 'center', paddingTop: 50, paddingBottom: 30,
  },
  speedRing: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  speedRingInner: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4,
  },
  speedRingCore: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#000000',
  },
  speedometerValue: {
    fontSize: 88, fontWeight: '200', lineHeight: 100,
    fontVariant: ['tabular-nums'],
  },
  speedometerUnit: {
    color: '#636366', fontSize: 16, fontWeight: '500', marginTop: 2, letterSpacing: 0.5,
  },
  speedIndicatorRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 24, paddingHorizontal: 40, width: '100%',
  },
  speedIndicatorItem: { alignItems: 'center', gap: 6 },
  speedIndicatorBar: {
    width: 3, height: 14, borderRadius: 1.5, backgroundColor: '#2C2C2E',
  },
  speedIndicatorText: { color: '#3A3A3C', fontSize: 10, fontVariant: ['tabular-nums'] },
});
