// @plm SRS-043 SRS-048  처방 행 에디터(프레젠테이셔널 공용) — 루틴 에디터(로컬)와 코칭 화면(원격)이 공유.
// 행별 타입 순환(일반→웜업→탑→백오프)·RIR(0~6)·반복범위 입력 + 행 추가/삭제. 저장·영속은 호출측 책임.
import React from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, IconButton } from '../../components';
import { colors, fontSize, radius, spacing } from '../../theme';
import { useT, type TransKey } from '../../i18n';
import type { PrescribedSet, PrescribedSetType } from '../../domain';

const RX_TYPE_ORDER: PrescribedSetType[] = ['normal', 'warmup', 'top', 'backoff'];
const RX_TYPE_KEY: Record<PrescribedSetType, TransKey> = {
  normal: 'routines.rxType.normal',
  warmup: 'routines.rxType.warmup',
  top: 'routines.rxType.top',
  backoff: 'routines.rxType.backoff',
};
export const RX_SUMMARY_CHAR: Record<PrescribedSetType, string> = { normal: '·', warmup: 'W', top: 'T', backoff: 'B' };

export function emptyRxRow(): PrescribedSet {
  return { setType: 'normal', targetRir: null, repMin: null, repMax: null, loadHint: null };
}

// 처방 요약('W W T B') — 목록 표시에 공용.
export function rxSummary(rx: PrescribedSet[] | null): string | null {
  return rx && rx.length > 0 ? rx.map((r) => RX_SUMMARY_CHAR[r.setType]).join(' ') : null;
}

export function PrescriptionRows({ rows, onChange }: { rows: PrescribedSet[]; onChange: (rows: PrescribedSet[]) => void }) {
  const { t } = useT();
  function cycleType(i: number) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, setType: RX_TYPE_ORDER[(RX_TYPE_ORDER.indexOf(r.setType) + 1) % RX_TYPE_ORDER.length] } : r)));
  }
  function setNum(i: number, key: 'targetRir' | 'repMin' | 'repMax', txt: string) {
    const n = parseInt(txt, 10);
    const val = Number.isNaN(n) || n < 0 ? null : key === 'targetRir' ? Math.min(6, n) : n;
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  }
  const numCell = (i: number, key: 'targetRir' | 'repMin' | 'repMax', value: number | null) => (
    <TextInput
      value={value != null ? String(value) : ''}
      onChangeText={(txt) => setNum(i, key, txt)}
      keyboardType="numeric"
      placeholder="–"
      placeholderTextColor={colors.textFaint}
      style={styles.numCell}
    />
  );
  return (
    <View>
      <View style={styles.gridHead}>
        <AppText variant="label" color="textFaint" style={styles.colType}>{t('routines.rxColType')}</AppText>
        <AppText variant="label" color="textFaint" style={styles.colNum}>{t('routines.rxColRir')}</AppText>
        <AppText variant="label" color="textFaint" style={styles.colNum}>{t('routines.rxColRepMin')}</AppText>
        <AppText variant="label" color="textFaint" style={styles.colNum}>{t('routines.rxColRepMax')}</AppText>
        <View style={styles.colDel} />
      </View>
      <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
        {rows.map((r, i) => (
          <View key={i} style={styles.row}>
            <Button
              title={t(RX_TYPE_KEY[r.setType])}
              size="sm"
              variant={r.setType !== 'normal' ? 'secondary' : 'ghost'}
              fullWidth={false}
              onPress={() => cycleType(i)}
              style={styles.typeBtn}
            />
            {numCell(i, 'targetRir', r.targetRir)}
            {numCell(i, 'repMin', r.repMin)}
            {numCell(i, 'repMax', r.repMax)}
            <IconButton icon="close" size={16} color="textFaint" onPress={() => onChange(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows)} />
          </View>
        ))}
      </ScrollView>
      <Button title={t('routines.rxAddSet')} icon="add" variant="secondary" size="sm" onPress={() => onChange([...rows, emptyRxRow()])} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

const styles = StyleSheet.create({
  gridHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.xs },
  colType: { width: 86 },
  colNum: { flex: 1, textAlign: 'center' },
  colDel: { width: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 3 },
  typeBtn: { width: 86 },
  numCell: {
    flex: 1,
    minWidth: 0,
    height: 38,
    textAlign: 'center',
    color: colors.text,
    fontSize: fontSize.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
