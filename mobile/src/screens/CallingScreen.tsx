import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ScrollView, Alert, Linking, Modal, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { api } from '../lib/api';
import { storage } from '../lib/storage';
import * as Clipboard from 'expo-clipboard';
import SessionControls from '../components/SessionControls';

export default function CallingScreen() {
  const [session, setSession] = useState<any>(null);
  const [currentLead, setCurrentLead] = useState<any>(null);
  const [currentReservation, setCurrentReservation] = useState<any>(null);
  const [leadHistory, setLeadHistory] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'inactive' | 'active' | 'paused'>('inactive');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const [attempt, setAttempt] = useState(1);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [showEndShift, setShowEndShift] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [callCount, setCallCount] = useState(0);

  const normalizeStatus = (s?: string): 'inactive' | 'active' | 'paused' => {
    if (!s) return 'inactive';
    const low = s.toLowerCase();
    if (low === 'active') return 'active';
    if (low === 'paused') return 'paused';
    return 'inactive';
  };

  const clearSession = () => {
    setSession(null); setSessionStatus('inactive'); setCurrentLead(null);
    setCurrentReservation(null); setResponses([]); setElapsedTime(0);
  };

  useEffect(() => { initializeSession(); loadAgentInfo(); setupPushListener(); return () => { if (timerRef.current) clearInterval(timerRef.current); if (heartbeatRef.current) clearInterval(heartbeatRef.current); }; }, []);

  const setupPushListener = () => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (data?.type === 'FORCE_LOGOUT') {
        clearSession();
        Alert.alert('Session Ended', 'Your session has been ended by an administrator.');
      }
    });
    return () => sub.remove();
  };
  useEffect(() => { if (sessionStatus === 'active') startTimer(); else stopTimer(); }, [sessionStatus]);
  useEffect(() => {
    if (sessionStatus === 'active' && session?.id) {
      heartbeatRef.current = setInterval(async () => {
        try {
          const res = await api.heartbeat(session.id);
          if (res && String((res as any).status).toUpperCase() === 'ENDED') {
            clearSession();
            Alert.alert('Session Ended', 'Your session has been ended by an administrator.');
          }
        } catch {
          clearSession();
        }
      }, 30000);
      api.heartbeat(session.id).catch(() => {});
    }
    return () => { if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; } };
  }, [sessionStatus, session?.id]);

  const loadAgentInfo = async () => {
    const name = await storage.getUserName();
    const role = await storage.getUserRole();
    if (name) setAgentName(name);
    if (role) setAgentRole(role);
  };

  const initializeSession = async () => {
    try {
      const currentSession = await api.getCurrentSession();
      if (currentSession && currentSession.id) {
        setSession(currentSession);
        setSessionStatus(normalizeStatus(currentSession.status));
        if (currentSession.clockInAt) {
          const start = new Date(currentSession.clockInAt).getTime();
          setElapsedTime(Math.floor((Date.now() - start) / 1000));
        }
        try {
          const leadData = await api.getCurrentLead();
          if (leadData?.lead) {
            setCurrentLead(leadData.lead);
            setCurrentReservation(leadData.reservation || null);
            setLeadHistory(leadData.history || []);
            setAttempt(1);
          } else if (normalizeStatus(currentSession.status) === 'active') {
            try {
              const deviceId = await storage.getDeviceId();
              const next = await api.getNextLead(deviceId || '', currentSession.id);
              if (next?.lead) { setCurrentLead(next.lead); setCurrentReservation(next.reservation || null); setLeadHistory(next.history || []); setAttempt(1); }
            } catch {}
          }
        } catch {}
      }
    } catch { console.log('No active session'); }
  };

  const startTimer = () => { if (timerRef.current) return; timerRef.current = setInterval(() => setElapsedTime((p) => p + 1), 1000); };
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handleIN = async () => {
    setIsLoading(true);
    try {
      const deviceId = await storage.getDeviceId();
      const newSession = await api.createSession(deviceId || '');
      setSession(newSession);
      setSessionStatus('active');
      setElapsedTime(0);
      try {
        const next = await api.getNextLead(deviceId || '', newSession.id);
        if (next?.lead) { setCurrentLead(next.lead); setCurrentReservation(next.reservation || null); setLeadHistory(next.history || []); setAttempt(1); }
      } catch {
        try {
          const leadData = await api.getCurrentLead();
          if (leadData?.lead) { setCurrentLead(leadData.lead); setCurrentReservation(leadData.reservation || null); setAttempt(1); }
        } catch {}
      }
    } catch (err: any) { Alert.alert('Error', err.message || 'Failed to start session'); }
    finally { setIsLoading(false); }
  };

  const handlePause = async () => {
    if (!session) return;
    setIsLoading(true);
    try { await api.pauseSession(); setSessionStatus('paused'); }
    catch (err: any) { Alert.alert('Error', err.message || 'Failed to pause'); }
    finally { setIsLoading(false); }
  };

  const handleResume = async () => {
    if (!session) return;
    setIsLoading(true);
    try { await api.resumeSession(); setSessionStatus('active'); }
    catch (err: any) { Alert.alert('Error', err.message || 'Failed to resume'); }
    finally { setIsLoading(false); }
  };

  const handleOUT = () => { setShowEndShift(true); };

  const confirmOUT = async () => {
    setShowEndShift(false);
    setIsLoading(true);
    try {
      await api.endSession();
      clearSession();
    } catch (err: any) { Alert.alert('Error', err.message || 'Failed to end session'); }
    finally { setIsLoading(false); }
  };

  const handleLogout = async () => {
    setShowEndShift(false);
    setIsLoading(true);
    try {
      try { await api.endSession(); } catch {}
      await storage.clearAuth();
      clearSession();
    } catch (err: any) { Alert.alert('Error', err.message || 'Failed to logout'); }
    finally { setIsLoading(false); }
  };

  const handleSubmitResponse = async (responseData: any) => {
    if (!currentLead) return;
    const reservationId = currentReservation?.id;
    if (!reservationId) {
      Alert.alert('Error', 'Lead reservation expired. Tap next lead.');
      setShowResponseModal(false);
      return;
    }
    setShowResponseModal(false);
    setIsLoading(true);
    try {
      await api.submitResponse(currentLead.leadId || currentLead.id, {
        ...responseData,
        reservationId,
      });
      setResponses((p) => [{ id: Date.now().toString(), ...responseData, timestamp: new Date().toISOString() }, ...p]);
      const resp = (responseData.response || '').replace(/\s*\/\s*/g, '/').toLowerCase();
      if (resp === 'no answer' || resp === 'busy' || resp === 'call back/follow-up') {
        setAttempt((p) => p + 1);
        setCurrentReservation(null);
        try {
          const deviceId = await storage.getDeviceId();
          const next = await api.getNextLead(deviceId || '', session.id);
          if (next?.lead) { setCurrentLead(next.lead); setCurrentReservation(next.reservation || null); setLeadHistory(next.history || []); setAttempt(1); }
        } catch {}
      } else {
        setCurrentReservation(null);
        try {
          const deviceId = await storage.getDeviceId();
          const next = await api.getNextLead(deviceId || '', session.id);
          if (next?.lead) { setCurrentLead(next.lead); setCurrentReservation(next.reservation || null); setLeadHistory(next.history || []); setAttempt(1); }
          else { setCurrentLead(null); Alert.alert('Session Complete', 'No more leads available.'); }
        } catch {
          try {
            const leadData = await api.getCurrentLead();
            if (leadData?.lead) { setCurrentLead(leadData.lead); setCurrentReservation(leadData.reservation || null); setAttempt(1); }
            else { setCurrentLead(null); Alert.alert('Session Complete', 'No more leads available.'); }
          } catch { setCurrentLead(null); }
        }
      }
    } catch (err: any) { Alert.alert('Error', err.message || 'Failed to submit'); }
    finally { setIsLoading(false); }
  };

  const handleCallClient = () => {
    if (currentLead?.phone) {
      setCallCount((p) => p + 1);
      Linking.openURL(`tel:${currentLead.phone.replace(/[^0-9+]/g, '')}`);
    }
  };

  const copyToClipboard = async (text: string) => { await Clipboard.setStringAsync(text); };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#ffffff" />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <SessionControls
          sessionStatus={sessionStatus}
          onIN={handleIN}
          onPause={handlePause}
          onResume={handleResume}
          onOUT={handleOUT}
          isLoading={isLoading}
        />

        {sessionStatus !== 'inactive' && (
          <View style={styles.timerBar}>
            <Text style={styles.timerText}>
              {sessionStatus === 'active' ? 'Working: ' : 'Paused: '}{formatTime(elapsedTime)}
            </Text>
          </View>
        )}

        {currentLead ? (
          <View style={styles.leadCard}>
            <View style={styles.leadHeader}>
              <Text style={styles.leadTitle}>Current Lead</Text>
              <Text style={styles.leadNumber}>#{currentLead.leadId || currentLead.id}</Text>
            </View>
            <View style={styles.leadDetails}>
              <Text style={styles.leadName}>{currentLead.name}</Text>
              {currentLead.account && <Text style={styles.leadCompany}>{currentLead.account}</Text>}
              {currentLead.phone && (
                <View style={styles.phoneRow}>
                  <Text style={styles.leadPhone}>{currentLead.phone}</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(currentLead.phone)}>
                    <Ionicons name="copy-outline" size={16} color="#6b7280" />
                  </TouchableOpacity>
                </View>
              )}
              {currentLead.address && (
                <View style={styles.addressRow}>
                  <Ionicons name="location-outline" size={14} color="#6b7280" />
                  <Text style={styles.leadAddress}>{currentLead.address}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity key={`call-${callCount}`} style={[styles.callClientBtn, sessionStatus === 'paused' && styles.callClientBtnDisabled]} onPress={handleCallClient} activeOpacity={0.7} disabled={sessionStatus === 'paused'}>
              <Ionicons name="call" size={20} color={sessionStatus === 'paused' ? '#9ca3af' : '#ffffff'} />
              <Text style={[styles.callClientText, sessionStatus === 'paused' && styles.callClientTextDisabled]}>{sessionStatus === 'paused' ? 'Resume to Call' : 'Call Client'}</Text>
            </TouchableOpacity>
          </View>
        ) : sessionStatus !== 'inactive' ? (
          <View style={styles.noLead}>
            <Ionicons name="person-add-outline" size={48} color="#d1d5db" />
            <Text style={styles.noLeadText}>Waiting for lead assignment...</Text>
          </View>
        ) : null}

        {responses.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Previous Responses</Text>
            {responses.map((r) => (
              <View key={r.id} style={styles.historyItem}>
                <Text style={styles.historyDate}>{new Date(r.timestamp).toLocaleDateString()}</Text>
                <Text style={styles.historyResponse}>{r.response}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {sessionStatus !== 'inactive' && currentLead && (
        <TouchableOpacity style={styles.respondBtn} onPress={() => setShowResponseModal(true)}>
          <Text style={styles.respondBtnText}>Submit Response</Text>
        </TouchableOpacity>
      )}

      {showResponseModal && currentLead && (
        <ResponseModal
          lead={currentLead}
          onSubmit={handleSubmitResponse}
          onClose={() => setShowResponseModal(false)}
          isLoading={isLoading}
        />
      )}

      <Modal visible={showEndShift} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.endShiftCard}>
            <View style={styles.endShiftLogo}>
              <Ionicons name="call" size={28} color="#ffffff" />
              <View style={styles.endShiftChatBadge}>
                <Ionicons name="chatbubble" size={10} color="#ffffff" />
              </View>
            </View>
            <Text style={styles.endShiftTitle}>End Your Shift?</Text>
            <Text style={styles.endShiftDesc}>Are you sure you want to go OUT? Your attendance will be recorded.</Text>
            <TouchableOpacity style={styles.confirmOutBtn} onPress={confirmOUT}>
              <Text style={styles.confirmOutText}>OUT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowEndShift(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ResponseModal({ lead, onSubmit, onClose, isLoading }: { lead: any; onSubmit: (d: any) => void; onClose: () => void; isLoading: boolean }) {
  const [response, setResponse] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('');
  const [notes, setNotes] = useState('');

  const options = [
    'Interested', 'Not Interested', 'Call Back / Follow-up', 'No Answer', 'Busy',
    'Wrong Number', 'Not Reachable / Switched Off', 'Connected - Information Provided',
    'Already Purchased / Existing Customer', 'Do Not Call (DNC)', 'Language Barrier',
    'Invalid Number', 'Appointment/Meeting Scheduled', 'Sale/Conversion Completed', 'Other',
  ];

  const showFollowUp = ['Interested', 'Call Back / Follow-up', 'Appointment/Meeting Scheduled'].includes(response);
  const showNotes = ['Sale/Conversion Completed', 'Other'].includes(response);

  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.responseCard}>
          <View style={styles.responseHeader}>
            <TouchableOpacity onPress={onClose}><Ionicons name="arrow-back" size={24} color="#111827" /></TouchableOpacity>
            <Text style={styles.responseTitle}>Submit Response</Text>
          </View>

          <ScrollView style={styles.responseBody}>
            <View style={styles.leadInfoRow}>
              <View style={styles.leadAvatar}><Text style={styles.leadAvatarText}>{lead.name?.charAt(0) || 'L'}</Text></View>
              <View>
                <Text style={styles.leadInfoName}>{lead.name}</Text>
                <Text style={styles.leadInfoPhone}>{lead.phone}</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Call Outcome *</Text>
            <TouchableOpacity style={styles.outcomeSelector} onPress={() => {}}>
              <Text style={response ? styles.outcomeText : styles.outcomePlaceholder}>{response || 'Select outcome'}</Text>
              <Ionicons name="chevron-down" size={20} color="#9ca3af" />
            </TouchableOpacity>

            <View style={styles.optionList}>
              {options.map((opt) => (
                <TouchableOpacity key={opt} style={[styles.optionItem, response === opt && styles.optionActive]} onPress={() => setResponse(opt)}>
                  <View style={[styles.radio, response === opt && styles.radioActive]}>{response === opt && <View style={styles.radioDot} />}</View>
                  <Text style={[styles.optionText, response === opt && styles.optionTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {showFollowUp && (
              <>
                <Text style={styles.fieldLabel}>Follow-up Date</Text>
                <TextInput style={styles.textInput} value={followUpDate} onChangeText={setFollowUpDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
                <Text style={styles.fieldLabel}>Follow-up Time</Text>
                <TextInput style={styles.textInput} value={followUpTime} onChangeText={setFollowUpTime} placeholder="HH:MM" placeholderTextColor="#9ca3af" />
              </>
            )}

            {showNotes && (
              <>
                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput style={[styles.textInput, { height: 80 }]} value={notes} onChangeText={setNotes} placeholder="Enter notes..." placeholderTextColor="#9ca3af" multiline textAlignVertical="top" />
              </>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, (!response || isLoading) && styles.saveBtnDisabled]}
            onPress={() => onSubmit({ response, notes: notes || undefined, followUpDate: followUpDate || undefined, followUpTime: followUpTime || undefined })}
            disabled={!response || isLoading}
          >
            <Text style={styles.saveBtnText}>{isLoading ? 'Saving...' : 'Save & Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { flex: 1 },
  timerBar: {
    alignItems: 'center', paddingVertical: 8, marginHorizontal: 16,
  },
  timerText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  leadCard: {
    backgroundColor: '#ffffff', margin: 16, borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  leadHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  leadTitle: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  leadNumber: { fontSize: 14, fontWeight: '600', color: '#9ca3af' },
  leadDetails: { marginBottom: 16 },
  leadName: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  leadCompany: { fontSize: 14, color: '#6b7280', marginBottom: 8 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  leadPhone: { fontSize: 16, fontWeight: '600', color: '#374151' },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leadAddress: { fontSize: 13, color: '#6b7280' },
  callClientBtn: {
    backgroundColor: '#22c55e', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 10, gap: 8,
  },
  callClientBtnDisabled: {
    backgroundColor: '#e5e7eb',
  },
  callClientText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  callClientTextDisabled: { color: '#9ca3af' },
  noLead: { alignItems: 'center', paddingVertical: 60 },
  noLeadText: { fontSize: 16, color: '#9ca3af', marginTop: 12 },
  historySection: { backgroundColor: '#ffffff', margin: 16, borderRadius: 12, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 12 },
  historyItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  historyDate: { fontSize: 14, color: '#6b7280' },
  historyResponse: { fontSize: 14, fontWeight: '500', color: '#374151' },
  respondBtn: {
    backgroundColor: '#14b8a6', marginHorizontal: 16, marginBottom: 16, paddingVertical: 16,
    borderRadius: 12, alignItems: 'center',
  },
  respondBtnText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  endShiftCard: {
    backgroundColor: '#ffffff', borderRadius: 20, padding: 32, alignItems: 'center', width: '80%',
  },
  endShiftLogo: {
    width: 64, height: 64, borderRadius: 16, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  endShiftChatBadge: {
    position: 'absolute', top: -4, right: -4, width: 20, height: 20,
    borderRadius: 10, backgroundColor: '#14b8a6', alignItems: 'center', justifyContent: 'center',
  },
  endShiftTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  endShiftDesc: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 },
  confirmOutBtn: {
    width: '100%', backgroundColor: '#ef4444', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12,
  },
  confirmOutText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  logoutBtn: {
    width: '100%', backgroundColor: '#6b7280', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12,
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  cancelBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  responseCard: {
    backgroundColor: '#ffffff', width: '100%', height: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  responseHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  responseTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  responseBody: { flex: 1, padding: 16 },
  leadInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  leadAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center' },
  leadAvatarText: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  leadInfoName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  leadInfoPhone: { fontSize: 13, color: '#6b7280' },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  outcomeSelector: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, marginBottom: 12,
  },
  outcomeText: { fontSize: 14, color: '#111827' },
  outcomePlaceholder: { fontSize: 14, color: '#9ca3af' },
  optionList: { marginBottom: 16 },
  optionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  optionActive: {},
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#14b8a6' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#14b8a6' },
  optionText: { fontSize: 14, color: '#374151', flex: 1 },
  optionTextActive: { fontWeight: '600', color: '#111827' },
  textInput: {
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    padding: 14, fontSize: 14, color: '#111827', marginBottom: 16,
  },
  saveBtn: { backgroundColor: '#14b8a6', margin: 16, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#94a3b8' },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
});
