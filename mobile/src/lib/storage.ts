import * as SecureStore from 'expo-secure-store';

export const storage = {
  getToken: () => SecureStore.getItemAsync('auth_token'),
  setToken: (token: string) => SecureStore.setItemAsync('auth_token', token),
  getRefreshToken: () => SecureStore.getItemAsync('refresh_token'),
  setRefreshToken: (token: string) => SecureStore.setItemAsync('refresh_token', token),
  getDeviceId: () => SecureStore.getItemAsync('device_id'),
  setDeviceId: (id: string) => SecureStore.setItemAsync('device_id', id),
  getPrivateKey: () => SecureStore.getItemAsync('private_key'),
  setPrivateKey: (key: string) => SecureStore.setItemAsync('private_key', key),
  getDeviceRegistered: () => SecureStore.getItemAsync('device_registered'),
  setDeviceRegistered: (value: string) => SecureStore.setItemAsync('device_registered', value),
  getDeviceName: () => SecureStore.getItemAsync('device_name'),
  setDeviceName: (name: string) => SecureStore.setItemAsync('device_name', name),
  getUserEmail: () => SecureStore.getItemAsync('user_email'),
  setUserEmail: (email: string) => SecureStore.setItemAsync('user_email', email),
  getUserName: () => SecureStore.getItemAsync('user_name'),
  setUserName: (name: string) => SecureStore.setItemAsync('user_name', name),
  getUserRole: () => SecureStore.getItemAsync('user_role'),
  setUserRole: (role: string) => SecureStore.setItemAsync('user_role', role),
  // Clear auth only — keep device registration so user returns to login, not re-registration
  clearAuth: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('user_email');
    await SecureStore.deleteItemAsync('user_name');
    await SecureStore.deleteItemAsync('user_role');
  },
  clearAll: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('device_id');
    await SecureStore.deleteItemAsync('private_key');
    await SecureStore.deleteItemAsync('device_registered');
    await SecureStore.deleteItemAsync('device_name');
    await SecureStore.deleteItemAsync('user_email');
    await SecureStore.deleteItemAsync('user_name');
    await SecureStore.deleteItemAsync('user_role');
  },
};