import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SettingsProvider } from './SettingsContext';
import { TrajectoryConsentProvider } from './state/trajectoryConsent';
import DriveScreen from './screens/DriveScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <TrajectoryConsentProvider>
          <StatusBar barStyle="light-content" />
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }} edges={['top']}>
            <DriveScreen />
          </SafeAreaView>
        </TrajectoryConsentProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
