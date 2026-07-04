import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { colors } from './src/theme';
import { RootNavigator } from './src/navigation/RootNavigator';
import { UserProvider } from './src/state/userContext';
import { SessionProvider } from './src/state/sessionContext';
import { seedExercisesIfNeeded } from './src/data/seedRunner';
import { AppText, AlertHost } from './src/components';
import { installWebAlert } from './src/utils/alert';
import { LanguageSync } from './src/i18n/LanguageSync';
import { t } from './src/i18n';
import { serverApi } from './src/sync/serverApi';
import { registerPushToken } from './src/push/push';
import { initPwa } from './src/push/pwa';

// 웹에서 RN Alert.alert(no-op)를 테마 모달 호스트로 라우팅(확인/취소 콜백 정상화).
installWebAlert();

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    primary: colors.primary,
    border: colors.border,
  },
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await seedExercisesIfNeeded();
      } catch (e) {
        setError(String(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // PWA(웹) 부트스트랩 + 이미 로그인된 상태면 푸시 토큰 갱신(네이티브·graceful).
  useEffect(() => {
    initPwa();
    serverApi
      .isLoggedIn()
      .then((yes) => {
        if (yes) void registerPushToken();
      })
      .catch(() => {});
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <UserProvider>
        <LanguageSync />
        <SessionProvider>
          <NavigationContainer theme={navTheme}>
            {error ? (
              <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <AppText variant="heading" center>
                  {t('app.initError')}
                </AppText>
                <AppText variant="caption" color="textMuted" center style={{ marginTop: 8 }}>
                  {error}
                </AppText>
              </View>
            ) : (
              <RootNavigator />
            )}
          </NavigationContainer>
        </SessionProvider>
        </UserProvider>
        <AlertHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
