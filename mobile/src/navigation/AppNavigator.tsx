import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { storage } from '../lib/storage';
import { BASE_URL as API_BASE } from '../lib/api';
import DeviceRegistrationScreen from '../screens/DeviceRegistrationScreen';
import LoginScreen from '../screens/LoginScreen';
import CallingScreen from '../screens/CallingScreen';
import ChatScreen from '../screens/ChatScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import FollowUpsScreen from '../screens/FollowUpsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { Platform, View } from 'react-native';

const Tab = createBottomTabNavigator();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
  }),
});

export default function AppNavigator() {
  const [isDeviceRegistered, setIsDeviceRegistered] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { checkAuthState(); }, []);

  const checkAuthState = async () => {
    try {
      const deviceRegistered = await storage.getDeviceRegistered();
      const token = await storage.getToken();
      setIsDeviceRegistered(deviceRegistered === 'true');
      setIsAuthenticated(!!token);
    } catch { setIsDeviceRegistered(false); setIsAuthenticated(false); }
    finally { setIsLoading(false); }
  };

  const handleDeviceRegistrationComplete = () => { setIsDeviceRegistered(true); setIsAuthenticated(false); };

  const handleLoginComplete = async () => {
    setIsAuthenticated(true);
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') { const { status } = await Notifications.requestPermissionsAsync(); finalStatus = status; }
      if (finalStatus === 'granted') {
        const token = await Notifications.getExpoPushTokenAsync();
        const authToken = await storage.getToken();
        if (authToken) {
          await fetch(`${API_BASE}/api/devices/push-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ pushToken: token.data, platform: Platform.OS }),
          });
        }
      }
    } catch {}
  };

  const handleLogout = () => { setIsAuthenticated(false); };

  if (isLoading) return null;

  if (!isDeviceRegistered) {
    return (
      <NavigationContainer>
        <DeviceRegistrationScreen onComplete={handleDeviceRegistrationComplete} />
      </NavigationContainer>
    );
  }

  if (!isAuthenticated) {
    return (
      <NavigationContainer>
        <LoginScreen onComplete={handleLoginComplete} />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'call';
            if (route.name === 'Calling') iconName = focused ? 'call' : 'call-outline';
            else if (route.name === 'Chat') iconName = focused ? 'chatbubble' : 'chatbubble-outline';
            else if (route.name === 'Follow-ups') iconName = focused ? 'calendar' : 'calendar-outline';
            else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#14b8a6',
          tabBarInactiveTintColor: '#9ca3af',
          tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e5e7eb', paddingBottom: 8, paddingTop: 8, height: 60 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        })}
      >
        <Tab.Screen name="Calling" component={CallingScreen} />
        <Tab.Screen name="Chat" component={ChatScreen} />
        <Tab.Screen name="Follow-ups" component={FollowUpsScreen} />
        <Tab.Screen
          name="Profile"
          options={{
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
            ),
          }}
        >
          {(props) => <ProfileScreen {...props} onLogout={handleLogout} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
