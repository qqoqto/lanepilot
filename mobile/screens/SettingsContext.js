import { createContext, useContext, useState } from 'react';

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const [sensitivity, setSensitivity] = useState(15);  // 速差門檻 km/h
  const [voice, setVoice] = useState(true);
  const [commutePush, setCommutePush] = useState(true);
  const [enroutePush, setEnroutePush] = useState(true);
  const [bottleneckAlert, setBottleneckAlert] = useState(true);

  return (
    <SettingsContext.Provider value={{
      sensitivity, setSensitivity,
      voice, setVoice,
      commutePush, setCommutePush,
      enroutePush, setEnroutePush,
      bottleneckAlert, setBottleneckAlert,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
