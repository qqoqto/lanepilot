// API 設定
export const API_BASE = 'https://lanepilot-production.up.railway.app';

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
  if (speed > 80) return { bg: '#0a4d3a', text: '#7eedc8', bar: '#1DB954', level: '順暢' };
  if (speed > 60) return { bg: '#2a4a2a', text: '#b5e6a3', bar: '#66BB6A', level: '略慢' };
  if (speed > 40) return { bg: '#4a3a0a', text: '#ffd080', bar: '#FFA726', level: '車多' };
  if (speed > 20) return { bg: '#4a1a1a', text: '#ff9a9a', bar: '#EF5350', level: '壅塞' };
  return { bg: '#3a0a0a', text: '#ff7070', bar: '#8B0000', level: '嚴重壅塞' };
}

export function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  return `${Math.floor(diff / 3600)} 小時前`;
}
