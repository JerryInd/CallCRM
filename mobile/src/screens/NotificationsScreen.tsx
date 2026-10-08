import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storage } from '../lib/storage';
import { BASE_URL as API_BASE } from '../lib/api';

interface Notification {
  id: string; type: string; title: string; message: string;
  referenceId: string | null; referenceType: string | null; read: boolean; createdAt: string;
}

type Category = 'ALL' | 'MESSAGES' | 'LEADS' | 'FOLLOW-UPS' | 'SYSTEM';

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category>('ALL');

  const getHeaders = async () => {
    const token = await storage.getToken();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_BASE}/api/notifications?category=${category}`, { headers });
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {}
    setLoading(false);
  }, [category]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      const headers = await getHeaders();
      await fetch(`${API_BASE}/api/notifications/${id}/read`, { method: 'POST', headers });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {}
  };

  const markAllAsRead = async () => {
    try {
      const headers = await getHeaders();
      await fetch(`${API_BASE}/api/notifications/read-all`, { method: 'POST', headers });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  const formatTime = (iso: string) => {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return new Date(iso).toLocaleDateString();
    } catch { return ''; }
  };

  const getIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      NEW_MESSAGE: 'chatbubble', NEW_LEAD: 'call', FOLLOW_UP_DUE: 'calendar',
      FOLLOW_UP_ASSIGNED: 'calendar', ADMIN_ANNOUNCEMENT: 'megaphone',
      DEVICE_SUSPENDED: 'lock-closed', DEVICE_REVOKED: 'lock-closed',
      ACCOUNT_ACTION: 'flash', IMPORTANT_SYSTEM_ALERT: 'warning',
    };
    return icons[type] || 'notifications';
  };

  const getIconColor = (type: string) => {
    const colors: Record<string, string> = {
      NEW_MESSAGE: '#3b82f6', NEW_LEAD: '#22c55e', FOLLOW_UP_DUE: '#f97316',
      FOLLOW_UP_ASSIGNED: '#f97316', ADMIN_ANNOUNCEMENT: '#8b5cf6',
      DEVICE_SUSPENDED: '#ef4444', DEVICE_REVOKED: '#ef4444',
      ACCOUNT_ACTION: '#f97316', IMPORTANT_SYSTEM_ALERT: '#ef4444',
    };
    return colors[type] || '#6b7280';
  };

  const categories: Category[] = ['ALL', 'MESSAGES', 'LEADS', 'FOLLOW-UPS', 'SYSTEM'];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="menu" size={24} color="#111827" />
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.some(n => !n.read) && (
          <TouchableOpacity onPress={markAllAsRead}><Text style={styles.markAll}>Mark all read</Text></TouchableOpacity>
        )}
      </View>

      <View style={styles.categoryBar}>
        {categories.map((cat) => (
          <TouchableOpacity key={cat} style={[styles.catChip, category === cat && styles.catChipActive]} onPress={() => setCategory(cat)}>
            <Text style={[styles.catText, category === cat && styles.catTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#14b8a6" /></View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>No notifications</Text>
        </View>
      ) : (
        <FlatList data={notifications} keyExtractor={(item) => item.id} renderItem={({ item }) => (
          <TouchableOpacity style={[styles.notifItem, !item.read && styles.notifUnread]} onPress={() => markAsRead(item.id)}>
            <View style={[styles.notifIcon, { backgroundColor: getIconColor(item.type) + '15' }]}>
              <Ionicons name={getIcon(item.type)} size={20} color={getIconColor(item.type)} />
            </View>
            <View style={styles.notifContent}>
              <View style={styles.notifRow}>
                <Text style={[styles.notifTitle, !item.read && styles.notifTitleBold]} numberOfLines={1}>{item.title}</Text>
                {!item.read && <View style={styles.dot} />}
              </View>
              <Text style={styles.notifMsg} numberOfLines={2}>{item.message}</Text>
              <Text style={styles.notifTime}>{formatTime(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
        )} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827', flex: 1, marginLeft: 12 },
  markAll: { fontSize: 13, color: '#14b8a6', fontWeight: '500' },
  categoryBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#ffffff', gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6' },
  catChipActive: { backgroundColor: '#0f172a' },
  catText: { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  catTextActive: { color: '#ffffff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  notifItem: { flexDirection: 'row', padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  notifUnread: { backgroundColor: '#f0fdf4' },
  notifIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  notifContent: { flex: 1 },
  notifRow: { flexDirection: 'row', alignItems: 'center' },
  notifTitle: { fontSize: 14, fontWeight: '500', color: '#6b7280', flex: 1 },
  notifTitleBold: { fontWeight: '600', color: '#111827' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e', marginLeft: 8 },
  notifMsg: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  notifTime: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
});
