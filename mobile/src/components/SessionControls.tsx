import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SessionControlsProps {
  sessionStatus: 'inactive' | 'active' | 'paused';
  onIN: () => void;
  onPause: () => void;
  onResume: () => void;
  onOUT: () => void;
  isLoading: boolean;
}

export default function SessionControls({
  sessionStatus,
  onIN,
  onPause,
  onResume,
  onOUT,
  isLoading,
}: SessionControlsProps) {
  if (sessionStatus === 'inactive') {
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.inButton} onPress={onIN} disabled={isLoading}>
          <Ionicons name="call" size={22} color="#ffffff" />
          <Text style={styles.inText}>{isLoading ? 'Starting...' : 'IN'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isPaused = sessionStatus === 'paused';

  return (
    <View style={styles.wrap}>
      <View style={[styles.statusBar, isPaused ? styles.barPaused : styles.barActive]}>
        <View style={[styles.dot, isPaused ? styles.dotPaused : styles.dotActive]} />
        <Text style={[styles.barText, isPaused ? styles.txtPaused : styles.txtActive]}>
          {isPaused ? 'PAUSED' : 'IN — Working'}
        </Text>
      </View>

      <View style={styles.row}>
        {!isPaused && (
          <TouchableOpacity style={styles.btnPause} onPress={onPause} disabled={isLoading}>
            <Ionicons name="pause" size={18} color="#fff" />
            <Text style={styles.lbl}>Pause</Text>
          </TouchableOpacity>
        )}

        {isPaused && (
          <TouchableOpacity style={styles.btnResume} onPress={onResume} disabled={isLoading}>
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.lbl}>Resume</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.btnOut} onPress={onOUT} disabled={isLoading}>
          <Ionicons name="exit-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  inButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    paddingVertical: 18,
    borderRadius: 12,
  },
  inText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 10,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  barActive: { backgroundColor: '#dcfce7' },
  barPaused: { backgroundColor: '#fef3c7' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  dotActive: { backgroundColor: '#22c55e' },
  dotPaused: { backgroundColor: '#f97316' },
  barText: { fontSize: 14, fontWeight: '700' },
  txtActive: { color: '#166534' },
  txtPaused: { color: '#92400e' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnPause: {
    flex: 1,
    backgroundColor: '#eab308',
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  btnResume: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  btnOut: {
    backgroundColor: '#ef4444',
    width: 50,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lbl: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 6,
  },
});
