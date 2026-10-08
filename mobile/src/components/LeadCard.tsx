import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

interface LeadCardProps {
  lead: any;
  attempt: number;
}

export default function LeadCard({ lead, attempt }: LeadCardProps) {
  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
  };

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      account: 'Account',
      address: 'Address',
      brand: 'Brand',
      comments: 'Comments',
      social_trading: 'Social Trading',
      type: 'Type',
      date: 'Date',
      poi: 'POI',
    };
    return labels[field] || field;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.leadInfo}>
          <Text style={styles.leadId}>Lead #{lead.id}</Text>
          <View style={styles.attemptBadge}>
            <Text style={styles.attemptText}>Attempt #{attempt}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Name</Text>
          <Text style={styles.fieldValue}>{lead.name}</Text>
        </View>

        {lead.email && (
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.fieldWithCopy}>
              <Text style={styles.fieldValue} numberOfLines={1}>{lead.email}</Text>
              <TouchableOpacity 
                style={styles.copyButton}
                onPress={() => copyToClipboard(lead.email)}
              >
                <Ionicons name="copy-outline" size={16} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {lead.phone && (
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <View style={styles.fieldWithCopy}>
              <Text style={styles.fieldValue}>{lead.phone}</Text>
              <TouchableOpacity 
                style={styles.copyButton}
                onPress={() => copyToClipboard(lead.phone)}
              >
                <Ionicons name="copy-outline" size={16} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {lead.phone && (
          <TouchableOpacity style={styles.callButton}>
            <Ionicons name="call" size={20} color="#ffffff" />
            <Text style={styles.callButtonText}>CALL CLIENT</Text>
          </TouchableOpacity>
        )}

        {Object.entries(lead).map(([key, value]) => {
          if (['id', 'name', 'email', 'phone', 'status'].includes(key)) return null;
          if (!value) return null;
          return (
            <View key={key} style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{getFieldLabel(key)}</Text>
              <Text style={styles.fieldValue}>{String(value)}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  leadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leadId: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  attemptBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  attemptText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  content: {
    padding: 16,
    maxHeight: 400,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  fieldLabel: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  fieldValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  fieldWithCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  copyButton: {
    padding: 8,
    marginLeft: 8,
  },
  callButton: {
    flexDirection: 'row',
    backgroundColor: '#22c55e',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  callButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});