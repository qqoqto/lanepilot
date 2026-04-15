import { createContext, useContext, useState } from 'react';

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const [sensitivity, setSensitivity] = useState(15);  // 速差門檻 km/h

  return (
    <SettingsContext.Provider value={{ sensitivity, setSensitivity }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
