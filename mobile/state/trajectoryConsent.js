import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_ACK = 'lanepilot.trajectory.acknowledged';
const KEY_EN = 'lanepilot.trajectory.enabled';

const TrajectoryConsentContext = createContext(null);

export function TrajectoryConsentProvider({ children }) {
  // null = AsyncStorage 還沒讀完, 不要急著跳告知 modal
  const [acknowledged, setAcknowledged] = useState(null);
  // opt-out: 預設 true
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [ack, en] = await Promise.all([
          AsyncStorage.getItem(KEY_ACK),
          AsyncStorage.getItem(KEY_EN),
        ]);
        setAcknowledged(ack === '1');
        if (en === '0') setEnabled(false);
      } catch {
        // 讀失敗就當作沒看過, 至少跳一次告知比偷收安全
        setAcknowledged(false);
      }
    })();
  }, []);

  const acknowledge = async () => {
    setAcknowledged(true);
    try { await AsyncStorage.setItem(KEY_ACK, '1'); } catch {}
  };

  const updateEnabled = async (v) => {
    setEnabled(v);
    try { await AsyncStorage.setItem(KEY_EN, v ? '1' : '0'); } catch {}
  };

  return (
    <TrajectoryConsentContext.Provider
      value={{ acknowledged, enabled, acknowledge, setEnabled: updateEnabled }}
    >
      {children}
    </TrajectoryConsentContext.Provider>
  );
}

export function useTrajectoryConsent() {
  const ctx = useContext(TrajectoryConsentContext);
  if (!ctx) throw new Error('useTrajectoryConsent must be used inside TrajectoryConsentProvider');
  return ctx;
}
