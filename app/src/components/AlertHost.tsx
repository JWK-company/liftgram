// 테마 적용 알림/확인/액션시트 모달 호스트. App 루트에 1회 마운트.
// RN Modal 기반이라 웹·네이티브 모두 동작. utils/alert.showAlert가 이 호스트로 라우팅한다.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './primitives';
import { colors, radius, spacing } from '../theme';
import { _setAlertListener, type AlertButton, type AlertRequest } from '../utils/alert';
import { useT } from '../i18n';

export function AlertHost() {
  const { t } = useT();
  const [req, setReq] = useState<AlertRequest | null>(null);

  useEffect(() => {
    _setAlertListener((r) => setReq(r));
    return () => _setAlertListener(null);
  }, []);

  const dismiss = () => setReq(null);
  const press = (b: AlertButton) => {
    dismiss();
    b.onPress?.();
  };

  return (
    <Modal visible={!!req} transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable style={styles.card} onPress={() => {}}>
          {req ? (
            <>
              <AppText variant="heading">{req.title}</AppText>
              {req.message ? (
                <AppText variant="body" color="textMuted" style={{ marginTop: spacing.sm }}>
                  {req.message}
                </AppText>
              ) : null}
              <View style={styles.buttons}>
                {req.buttons.map((b, i) => (
                  <Pressable
                    key={i}
                    onPress={() => press(b)}
                    style={({ pressed }) => [styles.btn, pressed && { backgroundColor: colors.surfaceAlt }]}
                  >
                    <AppText
                      variant="body"
                      weight="bold"
                      center
                      style={{
                        color:
                          b.style === 'destructive'
                            ? colors.danger
                            : b.style === 'cancel'
                              ? colors.textMuted
                              : colors.primary,
                      }}
                    >
                      {b.text ?? t('common.ok')}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  buttons: { marginTop: spacing.lg, gap: spacing.xs },
  btn: { paddingVertical: spacing.md, borderRadius: radius.md },
});
