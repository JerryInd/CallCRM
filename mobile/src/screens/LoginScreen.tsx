import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { storage } from '../lib/storage';

interface Props { onComplete: () => void; }

export default function LoginScreen({ onComplete }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) { setError('Please enter both email and password'); return; }
    setIsLoading(true); setError('');
    try {
      const deviceId = await storage.getDeviceId();
      if (!deviceId) throw new Error('Device not registered');
      const response = await api.deviceLogin({ email: email.toLowerCase().trim(), password, deviceId });
      await storage.setToken(response.token);
      if (response.refreshToken) await storage.setRefreshToken(response.refreshToken);
      if (response.user) {
        await storage.setUserEmail(response.user.email);
        await storage.setUserName(response.user.name);
        await storage.setUserRole(response.user.role);
      }
      onComplete();
    } catch (err: any) {
      const msg = err.message || 'Login failed.';
      if (msg.includes('not authorized') || msg.includes('revoked') || msg.includes('not registered') || msg.includes('Device not registered')) {
        await storage.setDeviceRegistered('false');
        await storage.clearAll();
        setError('Device has been de-registered. Please register again.');
        return;
      }
      setError(msg);
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

        <Text style={styles.brandName}>CallCRM</Text>
        <Text style={styles.subtitle}>Agent Login</Text>
        <Text style={styles.description}>Sign in to continue</Text>

        <View style={styles.inputContainer}>
          <Ionicons name="mail-outline" size={20} color="#9ca3af" />
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email / Username"
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#9ca3af" />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#9ca3af"
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.checkboxRow} onPress={() => setKeepSignedIn(!keepSignedIn)}>
          <View style={[styles.checkbox, keepSignedIn && styles.checkboxActive]}>
            {keepSignedIn && <Ionicons name="checkmark" size={14} color="#ffffff" />}
          </View>
          <Text style={styles.checkboxLabel}>Keep me signed in</Text>
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={[styles.loginButton, isLoading && styles.loginButtonDisabled]} onPress={handleLogin} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.loginButtonText}>Login</Text>}
        </TouchableOpacity>

        <View style={styles.verifiedBadge}>
          <Ionicons name="checkmark-circle" size={20} color="#14b8a6" />
          <Text style={styles.verifiedText}>Device Verified</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  logoContainer: { marginBottom: 16 },
  logoIcon: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: '#0f172a',
    alignItems: 'center', justifyContent: 'center',
  },
  chatBadge: {
    position: 'absolute', top: -4, right: -4, width: 24, height: 24,
    borderRadius: 12, backgroundColor: '#14b8a6', alignItems: 'center', justifyContent: 'center',
  },
  brandName: { fontSize: 28, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  subtitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 4 },
  description: { fontSize: 14, color: '#9ca3af', marginBottom: 32 },
  inputContainer: {
    width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, marginBottom: 12, height: 56,
  },
  input: { flex: 1, height: 56, fontSize: 16, color: '#1f2937', marginLeft: 12 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 20, marginTop: 4 },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: '#d1d5db',
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  checkboxActive: { backgroundColor: '#14b8a6', borderColor: '#14b8a6' },
  checkboxLabel: { fontSize: 14, color: '#6b7280' },
  error: { fontSize: 14, color: '#ef4444', marginBottom: 12, textAlign: 'center' },
  loginButton: {
    width: '100%', height: 56, backgroundColor: '#14b8a6', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  loginButtonDisabled: { backgroundColor: '#94a3b8' },
  loginButtonText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 6 },
  verifiedText: { fontSize: 14, fontWeight: '500', color: '#14b8a6' },
});
