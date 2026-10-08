import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

interface ResponseBarProps {
  onSubmit: (response: any) => void;
  isLoading: boolean;
}

const responseOptions = [
  { id: 'interested', label: 'Interested', color: '#22c55e' },
  { id: 'not_interested', label: 'Not Interested', color: '#ef4444' },
  { id: 'call_back', label: 'Call Back', color: '#eab308' },
  { id: 'no_answer', label: 'No Answer', color: '#6b7280' },
  { id: 'busy', label: 'Busy', color: '#f97316' },
];

const otherOptions = [
  { id: 'sale', label: 'Sale Made' },
  { id: 'appointment', label: 'Appointment Set' },
  { id: 'other', label: 'Other' },
];

export default function ResponseBar({ onSubmit, isLoading }: ResponseBarProps) {
  const [selectedResponse, setSelectedResponse] = useState<string | null>(null);
  const [showOthersDropdown, setShowOthersDropdown] = useState(false);
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState(new Date());
  const [followUpTime, setFollowUpTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showOthersOptions, setShowOthersOptions] = useState(false);

  const showFollowUpFields = selectedResponse === 'interested' || 
                             selectedResponse === 'call_back' || 
                             selectedResponse === 'appointment';

  const showNotesField = selectedResponse === 'sale' || 
                         selectedResponse === 'other';

  const handleResponseSelect = (responseId: string) => {
    setSelectedResponse(responseId);
    setShowOthersOptions(false);
  };

  const handleOthersOptionSelect = (optionId: string) => {
    setSelectedResponse(optionId);
    setShowOthersOptions(false);
  };

  const handleSubmit = () => {
    if (!selectedResponse) return;

    const responseData: any = {
      response: selectedResponse,
      notes: notes || undefined,
    };

    if (showFollowUpFields) {
      responseData.followUpDate = followUpDate.toISOString().split('T')[0];
      responseData.followUpTime = followUpTime.toTimeString().slice(0, 5);
    }

    onSubmit(responseData);
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFollowUpDate(selectedDate);
    }
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      setFollowUpTime(selectedTime);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.responseButtons}>
        {responseOptions.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.responseButton,
              { backgroundColor: option.color },
              selectedResponse === option.id && styles.selectedButton,
            ]}
            onPress={() => handleResponseSelect(option.id)}
            disabled={isLoading}
          >
            <Text style={styles.responseButtonText}>{option.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[
            styles.responseButton,
            styles.othersButton,
            showOthersOptions && styles.selectedButton,
          ]}
          onPress={() => setShowOthersOptions(!showOthersOptions)}
          disabled={isLoading}
        >
          <Text style={styles.responseButtonText}>Others</Text>
        </TouchableOpacity>
      </ScrollView>

      {showOthersOptions && (
        <View style={styles.othersDropdown}>
          {otherOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.otherOption,
                selectedResponse === option.id && styles.selectedOtherOption,
              ]}
              onPress={() => handleOthersOptionSelect(option.id)}
            >
              <Text style={styles.otherOptionText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showFollowUpFields && (
        <View style={styles.followUpSection}>
          <Text style={styles.sectionTitle}>Follow-up Schedule</Text>
          
          <TouchableOpacity 
            style={styles.dateTimeButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateTimeText}>
              Date: {followUpDate.toLocaleDateString()}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.dateTimeButton}
            onPress={() => setShowTimePicker(true)}
          >
            <Text style={styles.dateTimeText}>
              Time: {followUpTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={followUpDate}
              mode="date"
              display="default"
              onChange={onDateChange}
              minimumDate={new Date()}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={followUpTime}
              mode="time"
              display="default"
              onChange={onTimeChange}
            />
          )}
        </View>
      )}

      {showNotesField && (
        <View style={styles.notesSection}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Enter notes..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
          />
        </View>
      )}

      <TouchableOpacity
        style={[styles.submitButton, (!selectedResponse || isLoading) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!selectedResponse || isLoading}
      >
        <Text style={styles.submitButtonText}>
          {isLoading ? 'Submitting...' : 'Submit Response'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    padding: 16,
  },
  responseButtons: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  responseButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  othersButton: {
    backgroundColor: '#6366f1',
  },
  selectedButton: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  responseButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  othersDropdown: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  otherOption: {
    padding: 12,
    borderRadius: 6,
    marginBottom: 4,
  },
  selectedOtherOption: {
    backgroundColor: '#e0e7ff',
  },
  otherOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  followUpSection: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  dateTimeButton: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  dateTimeText: {
    fontSize: 14,
    color: '#374151',
  },
  notesSection: {
    marginBottom: 12,
  },
  notesInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#374151',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});