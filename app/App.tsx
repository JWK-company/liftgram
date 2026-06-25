import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { colors } from './src/theme';
import { RootNavigator } from './src/navigation/RootNavigator';
import { UserProvider } from './src/state/userContext';
import { SessionProvider } from './src/state/sessionContext';
import { seedExercisesIfNeeded } from './src/data/seedRunner';
import { AppText } from './src/components';

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

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <UserProvider>
        <SessionProvider>
          <NavigationContainer theme={navTheme}>
            {error ? (
              <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <AppText variant="heading" center>
                  초기화 오류
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
    </SafeAreaProvider>
  );
}
