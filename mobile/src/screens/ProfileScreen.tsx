import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storage } from '../lib/storage';
import { api } from '../lib/api';
import { useRoute, useNavigation } from '@react-navigation/native';

interface Props { onLogout?: () => void; }

export default function ProfileScreen({ onLogout: onLogoutProp }: Props) {
  const route = useRoute<any>();
  const onLogout = onLogoutProp || route.params?.onLogout;
  const [profile, setProfile] = useState({ name: '', email: '', role: '', id: '' });
  const [deviceName, setDeviceName] = useState('');

  useEffect(() => { loadProfile(); loadDeviceInfo(); }, []);

  const loadProfile = async () => {
    try {
      const data = await api.getProfile();
      const u = data?.user || data;
      if (u) {
        setProfile({ name: u.name || '', email: u.email || '', role: u.role || '', id: u.id || u.userId || '' });
        if (u.name) await storage.setUserName(u.name);
        if (u.email) await storage.setUserEmail(u.email);
        if (u.role) await storage.setUserRole(u.role);
      }
    } catch {
      const name = await storage.getUserName();
      const email = await storage.getUserEmail();
      const role = await storage.getUserRole();
      setProfile({ name: name || '', email: email || '', role: role || '', id: '' });
    }
  };

  const loadDeviceInfo = async () => {
    const name = await storage.getDeviceName();
    setDeviceName(name || `${Platform.OS === 'ios' ? 'iPhone' : 'Android'}`);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try { await api.endSession(); } catch {}
          await storage.clearAuth();
          onLogout?.();
        },
      },
    ]);
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'A';

  const employeeId = profile.id ? `EMP-${profile.id.slice(0, 8).toUpperCase()}` : '—';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
          </View>
          <Text style={styles.name}>{profile.name}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{profile.role}</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Employee ID</Text>
            <Text style={styles.infoValue}>{employeeId}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{profile.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Device</Text>
            <View style={styles.deviceRow}>
              <Text style={styles.infoValue}>{deviceName}</Text>
              <View style={styles.activeBadge}><Text style={styles.activeText}>Active</Text></View>
            </View>
          </View>
        </View>

        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="settings-outline" size={22} color="#6b7280" />
            <Text style={styles.menuText}>App Settings</Text>
            <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="help-circle-outline" size={22} color="#6b7280" />
            <Text style={styles.menuText}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color="#ef4444" />
            <Text style={[styles.menuText, { color: '#ef4444' }]}>Logout</Text>
            <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', gap: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  content: { flex: 1 },
  avatarSection: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#14b8a6', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#ffffff' },
  name: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  roleBadge: { backgroundColor: '#ccfbf1', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12 },
  roleText: { fontSize: 13, fontWeight: '600', color: '#0d9488' },
  infoSection: { backgroundColor: '#ffffff', marginTop: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel: { fontSize: 14, color: '#6b7280' },
  infoValue: { fontSize: 15, fontWeight: '500', color: '#111827' },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  activeText: { fontSize: 11, fontWeight: '600', color: '#166534' },
  menuSection: { backgroundColor: '#ffffff', marginTop: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: '#374151' },
});
