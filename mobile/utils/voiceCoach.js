/**
 * 語音車道教練
 * 根據即時路況主動語音播報，駕駛不用看螢幕
 * 所有語音排隊播放，不會疊加；測速照相優先插隊
 * 播報時音樂自動降低音量（duck），播完恢復
 */
import * as Speech from 'expo-speech';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';

// 設定音訊模式：語音播報時降低音樂音量，不暫停
let audioModeReady = false;
async function ensureAudioMode() {
  if (audioModeReady) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
    });
    audioModeReady = true;
  } catch (e) {
    // 靜默失敗，不影響主功能
  }
}

// 防止重複播報：記錄上次播報內容和時間
let lastSpoken = '';
let lastSpokenTime = 0;
const MIN_INTERVAL = 15000; // 同一句至少間隔 15 秒
let enabled = true;

// 播報佇列
const queue = [];        // [{ text, priority }]  priority 越小越優先
let isSpeaking = false;

/**
 * 啟用/停用語音
 */
export function setVoiceEnabled(val) { enabled = val; }
export function isVoiceEnabled() { return enabled; }

/**
 * 處理佇列：播完一句再播下一句
 */
async function processQueue() {
  if (!enabled || isSpeaking || queue.length === 0) return;
  await ensureAudioMode();
  // 按優先度排序（小的先播）
  queue.sort((a, b) => a.priority - b.priority);
  const next = queue.shift();
  isSpeaking = true;
  Speech.speak(next.text, {
    language: 'zh-TW',
    rate: 1.05,
    pitch: 1.0,
    onDone: () => { isSpeaking = false; processQueue(); },
    onError: () => { isSpeaking = false; processQueue(); },
  });
  lastSpoken = next.text;
  lastSpokenTime = Date.now();
}

/**
 * 排隊播報語音（自動防重複）
 * priority: 0=最高（測速照相）, 1=高（壅塞）, 2=一般（車道建議）
 */
function speak(text, { force = false, priority = 2 } = {}) {
  if (!enabled) return;
  const now = Date.now();
  if (!force && text === lastSpoken && now - lastSpokenTime < MIN_INTERVAL) return;

  // 高優先度（測速照相）：清空佇列中低優先的，直接插隊
  if (priority === 0) {
    // 移除佇列中優先度比較低的
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].priority > 0) queue.splice(i, 1);
    }
    // 如果正在播低優先的，打斷它
    if (isSpeaking) {
      Speech.stop();
      isSpeaking = false;
    }
  }

  queue.push({ text, priority });
  processQueue();
}

/**
 * 測速照相提醒（最高優先）
 */
export function announceCamera(camera, userSpeed) {
  if (!camera) return;
  const dist = camera.distance;
  const limit = camera.speedLimit;
  if (dist > 1200) return; // 太遠不播

  if (userSpeed != null && userSpeed > limit) {
    speak(`注意，前方${dist}公尺測速照相，限速${limit}，目前車速超過限速`, { priority: 0 });
  } else if (dist <= 800) {
    speak(`前方${dist}公尺測速照相，限速${limit}`, { priority: 0 });
  }
}

/**
 * 車道建議播報
 */
export function announceLaneAdvice(advice, currentLane, sensitivity) {
  if (!advice) return;
  const diff = advice.speed_diff || 0;
  const bestLane = advice.best_lane;

  if (diff < sensitivity) return; // 差距不大，不播

  if (diff >= 30) {
    // 強烈建議
    if (currentLane) {
      speak(`建議從${currentLane}切到${bestLane}，快${Math.round(diff)}公里`);
    } else {
      speak(`建議切${bestLane}，快${Math.round(diff)}公里`);
    }
  } else {
    // 一般建議
    if (currentLane) {
      speak(`${bestLane}比較快，快${Math.round(diff)}公里`);
    } else {
      speak(`可以考慮${bestLane}，快${Math.round(diff)}公里`);
    }
  }
}

/**
 * 前方壅塞預警
 */
export function announceBottleneck(bottlenecks) {
  if (!bottlenecks || bottlenecks.length === 0) return;
  const bn = bottlenecks[0]; // 最近的一個
  speak(`注意，前方壅塞，${bn.worst_lane}降到${Math.round(bn.worst_speed)}公里`, { priority: 1 });
}

/**
 * 進入/離開國道
 */
export function announceHighwayEntry(roadName, direction) {
  speak(`已進入${roadName}${direction}`, { priority: 1 });
}

export function announceHighwayExit() {
  speak(`已離開國道`, { priority: 1 });
}

// =====================================================
// 預測式車道建議
// =====================================================

// 記錄各車道最近 N 筆速度（用於趨勢分析）
const speedHistory = {}; // key: laneName -> [{ speed, time }]
const HISTORY_SIZE = 5;

/**
 * 更新車道速度歷史
 */
export function updateSpeedHistory(lanes) {
  const now = Date.now();
  for (const lane of lanes) {
    if (lane.is_shoulder) continue;
    if (!speedHistory[lane.name]) speedHistory[lane.name] = [];
    const hist = speedHistory[lane.name];
    hist.push({ speed: lane.speed, time: now });
    if (hist.length > HISTORY_SIZE) hist.shift();
  }
}

/**
 * 分析車道趨勢
 * 回傳：{ laneName: trend } 其中 trend > 0 = 加速中, < 0 = 減速中
 */
export function analyzeTrends() {
  const trends = {};
  for (const [name, hist] of Object.entries(speedHistory)) {
    if (hist.length < 3) { trends[name] = 0; continue; }
    // 簡單線性趨勢：比較前半和後半的平均
    const mid = Math.floor(hist.length / 2);
    const firstHalf = hist.slice(0, mid);
    const secondHalf = hist.slice(mid);
    const avgFirst = firstHalf.reduce((s, h) => s + h.speed, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, h) => s + h.speed, 0) / secondHalf.length;
    trends[name] = Math.round(avgSecond - avgFirst);
  }
  return trends;
}

/**
 * 預測式播報：偵測到某車道正在快速減速，提前警告
 */
export function announcePrediction(lanes, currentLane) {
  const trends = analyzeTrends();

  // 找出正在減速的車道
  for (const lane of lanes) {
    if (lane.is_shoulder) continue;
    const trend = trends[lane.name] || 0;

    // 當前車道正在快速減速（每輪降 10+ km/h）
    if (lane.name === currentLane && trend <= -10) {
      // 找一個趨勢比較好的車道
      const better = lanes
        .filter(l => !l.is_shoulder && l.name !== currentLane && (trends[l.name] || 0) > trend)
        .sort((a, b) => b.speed - a.speed)[0];

      if (better) {
        speak(`${currentLane}正在變慢，建議提前切${better.name}`);
        return true;
      }
    }
  }
  return false;
}
