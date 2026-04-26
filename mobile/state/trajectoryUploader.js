import { useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../constants';
import { useTrajectoryConsent } from './trajectoryConsent';

const FLUSH_POINT_THRESHOLD = 60;       // 累積 60 點觸發送出
const FLUSH_INTERVAL_MS = 60 * 1000;    // 或每 60 秒, 取較早者
const MAX_BUFFER = 200;                 // 後端單批上限,網路掛時 buffer 上限
const ENDPOINT = '/api/v1/trajectories';

function newSessionId() {
  // 每次啟動 App 隨機產生, 不可追溯至個人 (privacy policy 已聲明)
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 12);
  return `s${ts}${rand}`.slice(0, 32);
}

export function useTrajectoryUploader() {
  const { acknowledged, enabled } = useTrajectoryConsent();

  const bufferRef = useRef([]);
  const sessionIdRef = useRef(newSessionId());
  const flushingRef = useRef(false);
  const acceptingRef = useRef(false);

  // 同意 modal 看過 + toggle 開著才收
  useEffect(() => {
    acceptingRef.current = acknowledged === true && enabled === true;
    // 使用者剛關掉 toggle: 已收的 buffer 也丟掉, 不要事後偷送
    if (!acceptingRef.current) bufferRef.current = [];
  }, [acknowledged, enabled]);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (bufferRef.current.length === 0) return;
    flushingRef.current = true;
    const points = bufferRef.current;
    bufferRef.current = [];
    try {
      const resp = await fetch(`${API_BASE}${ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionIdRef.current, points }),
      });
      // resp.ok=false (4xx/5xx) — 丟棄,重試沒用
      if (!resp.ok) return;
    } catch {
      // 網路掛了 — 留著等下次, 但別讓 buffer 無限漲
      bufferRef.current = points.concat(bufferRef.current).slice(-MAX_BUFFER);
    } finally {
      flushingRef.current = false;
    }
  }, []);

  // 60 秒週期 flush
  useEffect(() => {
    const i = setInterval(() => { flush(); }, FLUSH_INTERVAL_MS);
    return () => clearInterval(i);
  }, [flush]);

  // 元件卸載時把剩下的也送掉
  useEffect(() => () => { flush(); }, [flush]);

  const addPoint = useCallback((coords) => {
    if (!acceptingRef.current) return;
    if (!coords || coords.latitude == null || coords.longitude == null) return;
    bufferRef.current.push({
      captured_at: Date.now(),
      lat: coords.latitude,
      lon: coords.longitude,
      // expo-location 給的 speed 單位是 m/s, 後端期望 km/h
      speed: coords.speed != null && coords.speed >= 0 ? coords.speed * 3.6 : null,
      heading: coords.heading != null && coords.heading >= 0 ? coords.heading : null,
      accuracy: coords.accuracy != null && coords.accuracy >= 0 ? coords.accuracy : null,
    });
    if (bufferRef.current.length > MAX_BUFFER) {
      bufferRef.current = bufferRef.current.slice(-MAX_BUFFER);
    }
    if (bufferRef.current.length >= FLUSH_POINT_THRESHOLD) {
      flush();
    }
  }, [flush]);

  return { addPoint };
}
