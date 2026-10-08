import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  StatusBar, 
  ScrollView, 
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';

export default function ActivityScreen() {
  const [activities, setActivities] = useState<any[]>([]);
  const [stats, setStats] = useState({
    callsMade: 0,
    timeWorked: 0,
    responsesSubmitted: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    setIsLoading(true);
    try {
      const data = await api.getActivities();
      if (data) {
        setActivities(data.recent || []);
        setStats({
          callsMade: data.callsMade || 0,
          timeWorked: data.timeWorked || 0,
          responsesSubmitted: data.responsesSubmitted || 0,
        });
      }
    } catch (err) {
      console.log('Failed to load activities');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadActivities();
    setRefreshing(false);
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getResponseColor = (response: string) => {
    const colors: Record<string, string> = {
      interested: '#22c55e',
      not_interested: '#ef4444',
      call_back: '#eab308',
      no_answer: '#6b7280',
      busy: '#f97316',
      sale: '#8b5cf6',
      appointment: '#06b6d4',
    };
    return colors[response] || '#6b7280';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activity</Text>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="call-outline" size={24} color="#2563eb" />
            <Text style={styles.statValue}>{stats.callsMade}</Text>
            <Text style={styles.statLabel}>Calls Made</Text>
          </View>
          
          <View style={styles.statCard}>
            <Ionicons name="time-outline" size={24} color="#22c55e" />
            <Text style={styles.statValue}>{formatTime(stats.timeWorked)}</Text>
            <Text style={styles.statLabel}>Time Worked</Text>
          </View>
          
          <View style={styles.statCard}>
            <Ionicons name="chatbubbles-outline" size={24} color="#8b5cf6" />
            <Text style={styles.statValue}>{stats.responsesSubmitted}</Text>
            <Text style={styles.statLabel}>Responses</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Responses</Text>
          
          {activities.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No activity yet</Text>
            </View>
          ) : (
            activities.map((activity, index) => (
              <View key={activity.id || index} style={styles.activityItem}>
                <View style={styles.activityDot}>
                  <View 
                    style={[
                      styles.dot, 
                      { backgroundColor: getResponseColor(activity.response) }
                    ]} 
                  />
                </View>
                <View style={styles.activityContent}>
                  <View style={styles.activityHeader}>
                    <Text style={styles.activityLead}>Lead #{activity.leadId}</Text>
                    <Text style={styles.activityTime}>
                      {new Date(activity.timestamp).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </Text>
                  </View>
                  <View style={[
                    styles.responseBadge, 
                    { backgroundColor: getResponseColor(activity.response) }
                  ]}>
                    <Text style={styles.responseText}>{activity.response}</Text>
                  </View>
                  {activity.notes && (
                    <Text style={styles.activityNotes}>{activity.notes}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    backgroundColor: '#0f172a',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  content: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 12,
  },
  activityItem: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  activityDot: {
    marginRight: 12,
    paddingTop: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  activityContent: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityLead: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  activityTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  responseBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  responseText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'capitalize',
  },
  activityNotes: {
    fontSize: 14,
    color: '#6b7280',
  },
});