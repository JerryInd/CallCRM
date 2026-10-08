import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { storage } from '../lib/storage';
import { generateDeviceId, generateDeviceKeyPair } from '../lib/crypto';

interface Props { onComplete: () => void; }

export default function DeviceRegistrationScreen({ onComplete }: Props) {
  const [registrationCode, setRegistrationCode] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | 'waiting'>('form');

  useEffect(() => { initializeDevice(); }, []);

  const initializeDevice = async () => {
    try {
      let storedDeviceId = await storage.getDeviceId();
      if (!storedDeviceId) {
        storedDeviceId = await generateDeviceId();
        await storage.setDeviceId(storedDeviceId);
      }
      setDeviceId(storedDeviceId);
      const name = `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} ${Platform.Version}`;
      setDeviceName(name);
      await storage.setDeviceName(name);
      const { publicKey: pubKey } = await generateDeviceKeyPair();
      setPublicKey(pubKey);
    } catch { setError('Failed to initialize device'); }
  };

  const handleRegister = async () => {
    if (!registrationCode.trim()) { setError('Please enter a registration code'); return; }
    setIsLoading(true); setError('');
    try {
      const result = await api.registerDevice({
        deviceId, code: registrationCode.toUpperCase(), publicKey, deviceName,
      });
      if (result.deviceId) await storage.setDeviceId(result.deviceId);
      await storage.setDeviceRegistered('true');
      setStep('waiting');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your code and try again.');
    } finally { setIsLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Ionicons name="call" size={32} color="#ffffff" />
            <View style={styles.chatBadge}>
              <Ionicons name="chatbubble" size={12} color="#ffffff" />
            </View>
          </View>
        </View>

        <Text style={styles.welcomeText}>Welcome to</Text>
        <Text style={styles.brandName}>CallCRM</Text>
        <Text style={styles.description}>This device needs to be registered by your administrator to continue.</Text>

        <Text style={styles.label}>Registration Code</Text>
        <TextInput
          style={styles.input}
          value={registrationCode}
          onChangeText={(text) => setRegistrationCode(text.toUpperCase())}
          placeholder="8F82K291"
          placeholderTextColor="#9ca3af"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {step === 'form' ? (
          <TouchableOpacity style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleRegister} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Activate Device</Text>}
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingContainer}>
            <ActivityIndicator size="large" color="#14b8a6" />
            <Text style={styles.waitingText}>Waiting for admin approval...</Text>
            <TouchableOpacity style={[styles.button, { marginTop: 16 }]} onPress={onComplete}>
              <Text style={styles.buttonText}>Go to Login</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.helpLink}>
          <Text style={styles.helpText}>Don't have a code? Contact your administrator.</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  logoContainer: { marginBottom: 24 },
  logoIcon: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: '#0f172a',
    alignItems: 'center', justifyContent: 'center',
  },
  chatBadge: {
    position: 'absolute', top: -4, right: -4, width: 24, height: 24,
    borderRadius: 12, backgroundColor: '#14b8a6', alignItems: 'center', justifyContent: 'center',
  },
  welcomeText: { fontSize: 16, color: '#6b7280', marginBottom: 4 },
  brandName: { fontSize: 32, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  description: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginBottom: 32, paddingHorizontal: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', alignSelf: 'flex-start', marginBottom: 8 },
  input: {
    width: '100%', height: 56, backgroundColor: '#f9fafb', borderWidth: 1.5, borderColor: '#e5e7eb',
    borderRadius: 12, paddingHorizontal: 16, fontSize: 20, fontWeight: 'bold', color: '#1f2937',
    textAlign: 'center', letterSpacing: 4, marginBottom: 16,
  },
  error: { fontSize: 14, color: '#ef4444', marginBottom: 16, textAlign: 'center' },
  button: {
    width: '100%', height: 56, backgroundColor: '#0f172a', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { backgroundColor: '#94a3b8' },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  waitingContainer: { width: '100%', alignItems: 'center' },
  waitingText: { fontSize: 14, color: '#6b7280', marginTop: 12 },
  helpLink: { marginTop: 24 },
  helpText: { fontSize: 13, color: '#9ca3af', textDecorationLine: 'underline' },
});
