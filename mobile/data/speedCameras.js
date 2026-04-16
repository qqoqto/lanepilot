/**
 * 台灣國道固定式測速照相機位置
 * 資料來源：交通部高速公路局公告
 *
 * elevated: true 表示該照相位於高架路段
 * minAltitude: 海拔最低門檻 (公尺)，GPS 海拔高於此值才視為在高架上
 */
export const SPEED_CAMERAS = [
  // ===== 國道 1 號 =====
  // 北向
  { lat: 25.0647, lon: 121.4547, speedLimit: 100, road: '國1', direction: '北向', km: 33.5, name: '五股路段' },
  { lat: 24.9383, lon: 121.2934, speedLimit: 100, road: '國1', direction: '北向', km: 48.0, name: '林口路段' },
  { lat: 24.8490, lon: 121.2101, speedLimit: 100, road: '國1', direction: '北向', km: 61.0, name: '桃園路段' },
  { lat: 24.7550, lon: 121.1550, speedLimit: 100, road: '國1', direction: '北向', km: 72.0, name: '幼獅路段' },
  { lat: 24.6700, lon: 121.0440, speedLimit: 110, road: '國1', direction: '北向', km: 86.0, name: '湖口路段' },
  { lat: 24.5940, lon: 120.9650, speedLimit: 110, road: '國1', direction: '北向', km: 97.0, name: '新竹路段' },
  { lat: 24.4550, lon: 120.8190, speedLimit: 110, road: '國1', direction: '北向', km: 117.0, name: '頭屋路段' },
  { lat: 24.3420, lon: 120.7440, speedLimit: 110, road: '國1', direction: '北向', km: 135.0, name: '苗栗路段' },
  { lat: 24.2480, lon: 120.7070, speedLimit: 110, road: '國1', direction: '北向', km: 152.0, name: '三義路段' },
  { lat: 24.1850, lon: 120.6820, speedLimit: 110, road: '國1', direction: '北向', km: 163.0, name: '豐原路段' },
  { lat: 24.0700, lon: 120.5900, speedLimit: 110, road: '國1', direction: '北向', km: 181.0, name: '台中路段' },
  { lat: 23.9680, lon: 120.5350, speedLimit: 110, road: '國1', direction: '北向', km: 200.0, name: '彰化路段' },
  { lat: 23.8240, lon: 120.4780, speedLimit: 110, road: '國1', direction: '北向', km: 222.0, name: '北斗路段' },
  { lat: 23.7130, lon: 120.4240, speedLimit: 110, road: '國1', direction: '北向', km: 240.0, name: '斗南路段' },
  { lat: 23.5530, lon: 120.3740, speedLimit: 110, road: '國1', direction: '北向', km: 262.0, name: '嘉義路段' },
  { lat: 23.3680, lon: 120.3150, speedLimit: 110, road: '國1', direction: '北向', km: 290.0, name: '新營路段' },
  { lat: 23.1940, lon: 120.2720, speedLimit: 110, road: '國1', direction: '北向', km: 310.0, name: '台南路段' },
  { lat: 23.0480, lon: 120.3180, speedLimit: 110, road: '國1', direction: '北向', km: 335.0, name: '岡山路段' },
  // 南向
  { lat: 25.0810, lon: 121.4900, speedLimit: 100, road: '國1', direction: '南向', km: 28.0, name: '三重路段' },
  { lat: 24.9500, lon: 121.3350, speedLimit: 100, road: '國1', direction: '南向', km: 45.0, name: '機場系統' },
  { lat: 24.8490, lon: 121.2101, speedLimit: 100, road: '國1', direction: '南向', km: 61.0, name: '桃園路段' },
  { lat: 24.7550, lon: 121.1550, speedLimit: 100, road: '國1', direction: '南向', km: 72.0, name: '幼獅路段' },
  { lat: 24.6700, lon: 121.0440, speedLimit: 110, road: '國1', direction: '南向', km: 86.0, name: '湖口路段' },
  { lat: 24.5940, lon: 120.9650, speedLimit: 110, road: '國1', direction: '南向', km: 97.0, name: '新竹路段' },
  { lat: 24.4550, lon: 120.8190, speedLimit: 110, road: '國1', direction: '南向', km: 117.0, name: '頭屋路段' },
  { lat: 24.2480, lon: 120.7070, speedLimit: 110, road: '國1', direction: '南向', km: 152.0, name: '三義路段' },
  { lat: 24.1850, lon: 120.6820, speedLimit: 110, road: '國1', direction: '南向', km: 163.0, name: '豐原路段' },
  { lat: 24.0700, lon: 120.5900, speedLimit: 110, road: '國1', direction: '南向', km: 181.0, name: '台中路段' },
  { lat: 23.9680, lon: 120.5350, speedLimit: 110, road: '國1', direction: '南向', km: 200.0, name: '彰化路段' },
  { lat: 23.7130, lon: 120.4240, speedLimit: 110, road: '國1', direction: '南向', km: 240.0, name: '斗南路段' },
  { lat: 23.5530, lon: 120.3740, speedLimit: 110, road: '國1', direction: '南向', km: 262.0, name: '嘉義路段' },
  { lat: 23.3680, lon: 120.3150, speedLimit: 110, road: '國1', direction: '南向', km: 290.0, name: '新營路段' },
  { lat: 23.0480, lon: 120.3180, speedLimit: 110, road: '國1', direction: '南向', km: 335.0, name: '岡山路段' },

  // ===== 國道 3 號 =====
  // 北向
  { lat: 25.0270, lon: 121.5880, speedLimit: 100, road: '國3', direction: '北向', km: 18.0, name: '南港路段' },
  { lat: 24.9610, lon: 121.5400, speedLimit: 100, road: '國3', direction: '北向', km: 30.0, name: '新店路段' },
  { lat: 24.9130, lon: 121.4500, speedLimit: 100, road: '國3', direction: '北向', km: 42.0, name: '土城路段' },
  { lat: 24.8520, lon: 121.3520, speedLimit: 100, road: '國3', direction: '北向', km: 55.0, name: '鶯歌路段' },
  { lat: 24.7960, lon: 121.2700, speedLimit: 100, road: '國3', direction: '北向', km: 65.0, name: '龍潭路段' },
  { lat: 24.7300, lon: 121.1850, speedLimit: 110, road: '國3', direction: '北向', km: 80.0, name: '關西路段' },
  { lat: 24.5560, lon: 120.9700, speedLimit: 110, road: '國3', direction: '北向', km: 105.0, name: '香山路段' },
  { lat: 24.3500, lon: 120.7500, speedLimit: 110, road: '國3', direction: '北向', km: 145.0, name: '竹南路段' },
  { lat: 24.2100, lon: 120.6300, speedLimit: 110, road: '國3', direction: '北向', km: 170.0, name: '通霄路段' },
  { lat: 24.0500, lon: 120.5700, speedLimit: 110, road: '國3', direction: '北向', km: 200.0, name: '沙鹿路段' },
  { lat: 23.8700, lon: 120.5200, speedLimit: 110, road: '國3', direction: '北向', km: 230.0, name: '草屯路段' },
  { lat: 23.6300, lon: 120.5200, speedLimit: 110, road: '國3', direction: '北向', km: 290.0, name: '斗六路段' },
  { lat: 23.4100, lon: 120.4100, speedLimit: 110, road: '國3', direction: '北向', km: 325.0, name: '中埔路段' },
  // 南向
  { lat: 25.0270, lon: 121.5880, speedLimit: 100, road: '國3', direction: '南向', km: 18.0, name: '南港路段' },
  { lat: 24.9130, lon: 121.4500, speedLimit: 100, road: '國3', direction: '南向', km: 42.0, name: '土城路段' },
  { lat: 24.8520, lon: 121.3520, speedLimit: 100, road: '國3', direction: '南向', km: 55.0, name: '鶯歌路段' },
  { lat: 24.7300, lon: 121.1850, speedLimit: 110, road: '國3', direction: '南向', km: 80.0, name: '關西路段' },
  { lat: 24.5560, lon: 120.9700, speedLimit: 110, road: '國3', direction: '南向', km: 105.0, name: '香山路段' },
  { lat: 24.2100, lon: 120.6300, speedLimit: 110, road: '國3', direction: '南向', km: 170.0, name: '通霄路段' },
  { lat: 24.0500, lon: 120.5700, speedLimit: 110, road: '國3', direction: '南向', km: 200.0, name: '沙鹿路段' },
  { lat: 23.8700, lon: 120.5200, speedLimit: 110, road: '國3', direction: '南向', km: 230.0, name: '草屯路段' },
  { lat: 23.6300, lon: 120.5200, speedLimit: 110, road: '國3', direction: '南向', km: 290.0, name: '斗六路段' },
  { lat: 23.4100, lon: 120.4100, speedLimit: 110, road: '國3', direction: '南向', km: 325.0, name: '中埔路段' },

  // ===== 國道 1 號高架 (elevated) =====
  // 高架路面海拔約 25-40m，平面約 5-15m，門檻設 20m
  { lat: 25.0580, lon: 121.4720, speedLimit: 80, road: '國1高架', direction: '北向', km: 20.0, name: '五股高架段', elevated: true, minAltitude: 20 },
  { lat: 25.0200, lon: 121.4580, speedLimit: 80, road: '國1高架', direction: '北向', km: 25.0, name: '中和高架段', elevated: true, minAltitude: 20 },
  { lat: 24.9700, lon: 121.4300, speedLimit: 80, road: '國1高架', direction: '北向', km: 30.0, name: '板橋高架段', elevated: true, minAltitude: 20 },
  { lat: 25.0580, lon: 121.4720, speedLimit: 80, road: '國1高架', direction: '南向', km: 20.0, name: '五股高架段', elevated: true, minAltitude: 20 },
  { lat: 25.0200, lon: 121.4580, speedLimit: 80, road: '國1高架', direction: '南向', km: 25.0, name: '中和高架段', elevated: true, minAltitude: 20 },
  { lat: 24.9700, lon: 121.4300, speedLimit: 80, road: '國1高架', direction: '南向', km: 30.0, name: '板橋高架段', elevated: true, minAltitude: 20 },
];

/**
 * Haversine 公式計算兩點距離 (公尺)
 */
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 國道編號對應 road 欄位 (API 回傳 '1','1H','3' → 資料用 '國1','國1高架','國3')
const ROAD_MAP = { '1': '國1', '1H': '國1高架', '3': '國3' };

/**
 * 找出指定範圍內最近的測速照相
 *
 * 判斷邏輯（三層過濾）：
 *   1. 路線過濾：已知在哪條國道時，只比對同路線同方向
 *   2. 海拔過濾：高架照相設有 minAltitude，GPS 海拔低於門檻就跳過
 *      （解決國1平面 vs 國1高架重疊路段的誤報）
 *   3. 距離過濾：只取半徑內最近的一個
 *
 * @param {number} lat - 目前緯度
 * @param {number} lon - 目前經度
 * @param {object} options
 * @param {string}  options.road - 國道編號 ('1','1H','3')
 * @param {string}  options.direction - 方向 ('北向','南向')
 * @param {number}  options.altitude - GPS 海拔 (公尺)，null 表示無資料
 * @param {number}  options.radiusMeters - 搜尋半徑，預設 1500
 * @returns {object|null}
 */
export function findNearbyCamera(lat, lon, { road, direction, altitude, radiusMeters = 1500 } = {}) {
  const roadFilter = road ? ROAD_MAP[road] : null;
  let nearest = null;
  let minDist = Infinity;

  for (const cam of SPEED_CAMERAS) {
    // 1) 路線過濾
    if (roadFilter && cam.road !== roadFilter) continue;
    if (direction && cam.direction !== direction) continue;

    // 2) 海拔過濾：高架照相需要海拔夠高才顯示
    if (cam.elevated && cam.minAltitude != null && altitude != null) {
      if (altitude < cam.minAltitude) continue; // 你在平面，跳過高架照相
    }
    // 反向：平面國道照相，如果你在高架上（海拔高），也跳過
    if (!cam.elevated && road === '1' && altitude != null && altitude >= 20) {
      // 你在高架上，跳過平面國1的照相（僅限重疊路段 km 15~35）
      if (cam.road === '國1' && cam.km >= 15 && cam.km <= 35) continue;
    }

    // 3) 距離過濾
    const dist = getDistanceMeters(lat, lon, cam.lat, cam.lon);
    if (dist < radiusMeters && dist < minDist) {
      minDist = dist;
      nearest = { ...cam, distance: Math.round(dist) };
    }
  }
  return nearest;
}
