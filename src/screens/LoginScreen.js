import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import reportApi from '../api/reportApi';
import { setAuthToken } from '../api/apiClient';

/**
 * Screen: Autentikasi Pengguna (Login)
 * Terhubung langsung dengan reportApi.login dan JWT Interceptor
 */
export const LoginScreen = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Perhatian', 'Harap masukkan Email/NIM dan Kata Sandi.');
      return;
    }

    setIsLoading(true);
    try {
      // Memanggil endpoint login /api/v1/auth/login
      const result = await reportApi.login(email.trim(), password);

      if (result.success) {
        Alert.alert('Login Berhasil', `Selamat datang kembali di Lapor Kampus!`, [
          {
            text: 'Lanjutkan',
            onPress: () => {
              if (onLoginSuccess) onLoginSuccess();
            },
          },
        ]);
      }
    } catch (error) {
      console.warn('[LoginScreen] Gagal login:', error);

      // Berikan opsi masuk demo jika server backend belum aktif
      Alert.alert(
        'Koneksi Server Terkendala',
        `${error.message || 'Server belum dapat dijangkau.'}\n\nIngin masuk menggunakan Mode Demo Offline?`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Gunakan Mode Demo',
            onPress: handleDemoLogin,
          },
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Helper untuk masuk tanpa backend (Testing Mode)
  const handleDemoLogin = async () => {
    const dummyJwt = 'mock_jwt_token_' + Date.now();
    await setAuthToken(dummyJwt);
    if (onLoginSuccess) onLoginSuccess();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header Branding */}
          <View style={styles.brandContainer}>
            <Text style={styles.logoIcon}>🏛️</Text>
            <Text style={styles.brandTitle}>Lapor Kampus</Text>
            <Text style={styles.brandSubtitle}>
              Sistem Pelaporan & Pemeliharaan Fasilitas Universitas
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.loginTitle}>Masuk Akun</Text>
            <Text style={styles.loginSubtitle}>Gunakan akun email kampus atau NIM Anda</Text>

            {/* Input Email / NIM */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Kampus / NIM</Text>
              <TextInput
                style={styles.input}
                placeholder="nama@mahasiswa.ac.id / 2026xxxx"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#9AA0A6"
              />
            </View>

            {/* Input Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Kata Sandi</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholderTextColor="#9AA0A6"
              />
            </View>

            {/* Tombol Submit Login */}
            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.loginButtonText}>Masuk ke Sistem</Text>
              )}
            </TouchableOpacity>

            {/* Tombol Mode Demo (Bypass) */}
            <TouchableOpacity style={styles.demoButton} onPress={handleDemoLogin}>
              <Text style={styles.demoButtonText}>⚡ Masuk Langsung (Mode Demo / Tamu)</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    justifyContent: 'center',
    flexGrow: 1,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoIcon: {
    fontSize: 54,
    marginBottom: 8,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#202124',
  },
  brandSubtitle: {
    fontSize: 14,
    color: '#5F6368',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E8EAED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  loginTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#202124',
  },
  loginSubtitle: {
    fontSize: 13,
    color: '#5F6368',
    marginTop: 4,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C4043',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#202124',
  },
  loginButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonDisabled: {
    backgroundColor: '#80868B',
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  demoButton: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  demoButtonText: {
    fontSize: 13,
    color: '#1A73E8',
    fontWeight: '600',
  },
});

export default LoginScreen;
