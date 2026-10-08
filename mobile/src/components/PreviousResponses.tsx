import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

interface Response {
  id: string;
  response: string;
  notes?: string;
  timestamp: string;
  followUpDate?: string;
  followUpTime?: string;
}

interface PreviousResponsesProps {
  responses: Response[];
}

const getResponseColor = (response: string) => {
  const colors: Record<string, string> = {
    interested: '#22c55e',
    not_interested: '#ef4444',
    call_back: '#eab308',
    no_answer: '#6b7280',
    busy: '#f97316',
    sale: '#8b5cf6',
    appointment: '#06b6d4',
    other: '#6366f1',
  };
  return colors[response] || '#6b7280';
};

const getResponseLabel = (response: string) => {
  const labels: Record<string, string> = {
    interested: 'Interested',
    not_interested: 'Not Interested',
    call_back: 'Call Back',
    no_answer: 'No Answer',
    busy: 'Busy',
    sale: 'Sale Made',
    appointment: 'Appointment Set',
    other: 'Other',
  };
  return labels[response] || response;
};

export default function PreviousResponses({ responses }: PreviousResponsesProps) {
  if (responses.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Previous Responses</Text>
        <Text style={styles.emptyText}>No responses yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Previous Responses</Text>
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {responses.map((response, index) => (
          <View key={response.id} style={styles.responseItem}>
            <View style={styles.timeline}>
              <View 
                style={[
                  styles.dot, 
                  { backgroundColor: getResponseColor(response.response) },
                  index === responses.length - 1 && styles.lastDot,
                ]} 
              />
              {index < responses.length - 1 && <View style={styles.line} />}
            </View>
            
            <View style={styles.content}>
              <View style={styles.header}>
                <View 
                  style={[
                    styles.badge, 
                    { backgroundColor: getResponseColor(response.response) },
                  ]}
                >
                  <Text style={styles.badgeText}>{getResponseLabel(response.response)}</Text>
                </View>
                <Text style={styles.timestamp}>
                  {new Date(response.timestamp).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </Text>
              </View>
              
              {response.notes && (
                <Text style={styles.notes}>{response.notes}</Text>
              )}
              
              {response.followUpDate && (
                <Text style={styles.followUp}>
                  Follow-up: {response.followUpDate} {response.followUpTime}
                </Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    margin: 16,
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 20,
  },
  list: {
    maxHeight: 200,
  },
  responseItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timeline: {
    alignItems: 'center',
    marginRight: 12,
    width: 20,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  lastDot: {
    marginBottom: 0,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: '#e5e7eb',
    marginTop: 4,
  },
  content: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 12,
    color: '#9ca3af',
  },
  notes: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  followUp: {
    fontSize: 12,
    color: '#2563eb',
    fontStyle: 'italic',
  },
});