// API 設定
export const API_BASE = 'http://localhost:8000';

// 色彩常數
export const COLORS = {
  bg: '#111114',
  card: '#1e1e22',
  border: '#2a2a2e',
  green: '#1D9E75',
  greenBg: '#0F6E56',
  greenText: '#9FE1CB',
  yellow: '#BA7517',
  yellowBg: '#633806',
  yellowText: '#FAC775',
  red: '#E24B4A',
  redBg: '#791F1F',
  redText: '#F7C1C1',
  white: '#ffffff',
  gray: '#888888',
  dimGray: '#666666',
  lightGray: '#cccccc',
  accent: '#5DCAA5',
};

export function getLaneColor(speed) {
  if (speed > 80) return { bg: COLORS.greenBg, text: COLORS.greenText, bar: COLORS.green };
  if (speed >= 40) return { bg: COLORS.yellowBg, text: COLORS.yellowText, bar: COLORS.yellow };
  return { bg: COLORS.redBg, text: COLORS.redText, bar: COLORS.red };
}

export function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  return `${Math.floor(diff / 3600)} 小時前`;
}
