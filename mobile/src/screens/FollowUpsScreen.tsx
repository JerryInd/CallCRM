import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ScrollView, RefreshControl, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';

const AVATAR_COLORS = ['#22c55e', '#f97316', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function FollowUpsScreen() {
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');

  useEffect(() => { loadFollowUps(); }, []);

  const loadFollowUps = async () => {
    setIsLoading(true);
    try {
      const data = await api.getFollowUps();
      const list = Array.isArray(data) ? data : (data?.followUps || data?.followups || []);
      setFollowUps(list);
    } catch {}
    finally { setIsLoading(false); }
  };

  const onRefresh = async () => { setRefreshing(true); await loadFollowUps(); setRefreshing(false); };

  const handleCall = (phone: string) => { Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, '')}`); };

  const formatDate = (d: string) => { try { return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return d; } };
  const formatTime = (t: string) => { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h, 10); return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; };

  const getAvatarColor = (name: string) => AVATAR_COLORS[(name || '').charCodeAt(0) % AVATAR_COLORS.length];

  const pending = followUps.filter(f => String(f.followUpStatus || '').toUpperCase() !== 'COMPLETED');
  const completed = followUps.filter(f => String(f.followUpStatus || '').toUpperCase() === 'COMPLETED');
  const displayed = activeTab === 'pending' ? pending : completed;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Follow-ups</Text>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tab, activeTab === 'pending' && styles.tabActive]} onPress={() => setActiveTab('pending')}>
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>Pending ({pending.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'completed' && styles.tabActive]} onPress={() => setActiveTab('completed')}>
          <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>Completed ({completed.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {displayed.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No {activeTab} follow-ups</Text>
          </View>
        ) : (
          displayed.map((f, i) => (
            <View key={f.id || i} style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={[styles.avatar, { backgroundColor: getAvatarColor(f.leadName) }]}>
                  <Text style={styles.avatarText}>{(f.leadName || 'L').charAt(0).toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.cardCenter}>
                <Text style={styles.cardName}>{f.leadName}</Text>
                <Text style={styles.cardId}>#{f.leadId || f.id}</Text>
                <View style={styles.cardMeta}>
                  <Ionicons name="calendar-outline" size={14} color="#6b7280" />
                  <Text style={styles.cardMetaText}>{formatDate(f.followUpDate)}</Text>
                  <Ionicons name="time-outline" size={14} color="#6b7280" />
                  <Text style={styles.cardMetaText}>{formatTime(f.followUpTime)}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.callBtn} onPress={() => handleCall(f.phone)}>
                <Ionicons name="call" size={20} color="#22c55e" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', gap: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  tabBar: { flexDirection: 'row', backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#14b8a6' },
  tabText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#14b8a6', fontWeight: '600' },
  content: { flex: 1, padding: 16 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#9ca3af' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  cardLeft: { marginRight: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  cardCenter: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardId: { fontSize: 13, color: '#9ca3af', marginBottom: 6 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardMetaText: { fontSize: 13, color: '#6b7280' },
  callBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' },
});
