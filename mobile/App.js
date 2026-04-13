import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar, View, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SettingsProvider } from './SettingsContext';

import RealtimeScreen from './screens/RealtimeScreen';
import SectionsScreen from './screens/SectionsScreen';
import CommuteScreen from './screens/CommuteScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const COLORS = {
  bg: '#111114',
  border: '#2a2a2e',
  green: '#5DCAA5',
  gray: '#666666',
};

function TabIcon({ label, focused }) {
  return (
    <View style={{ alignItems: 'center' }}>
      {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.green, marginBottom: 4 }} />}
      <Text style={{ color: focused ? COLORS.green : COLORS.gray, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
    <SettingsProvider>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#111114' }} edges={['top']}>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: COLORS.bg,
              borderTopColor: COLORS.border,
              borderTopWidth: 0.5,
              paddingTop: 8,
              paddingBottom: 8,
              height: 56,
            },
            tabBarShowLabel: false,
          }}
        >
          <Tab.Screen name="Realtime" component={RealtimeScreen}
            options={{ tabBarIcon: ({ focused }) => <TabIcon label="即時" focused={focused} /> }} />
          <Tab.Screen name="Sections" component={SectionsScreen}
            options={{ tabBarIcon: ({ focused }) => <TabIcon label="路段" focused={focused} /> }} />
          <Tab.Screen name="Commute" component={CommuteScreen}
            options={{ tabBarIcon: ({ focused }) => <TabIcon label="通勤" focused={focused} /> }} />
          <Tab.Screen name="Settings" component={SettingsScreen}
            options={{ tabBarIcon: ({ focused }) => <TabIcon label="設定" focused={focused} /> }} />
        </Tab.Navigator>
      </NavigationContainer>
      </SafeAreaView>
    </SettingsProvider>
    </SafeAreaProvider>
  );
}
