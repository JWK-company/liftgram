// @plm SRS-018  캡션의 #해시태그를 탭 가능하게 렌더(→ HashtagScreen).
import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { AppText } from '../../components';

const SPLIT = /(#[\p{L}\p{N}_]{1,50})/gu;
const FULL = /^#[\p{L}\p{N}_]{1,50}$/u;

export function HashtagText({
  text,
  onTag,
  numberOfLines,
  style,
}: {
  text: string;
  onTag: (tag: string) => void;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <AppText variant="body" numberOfLines={numberOfLines} style={style}>
      {text.split(SPLIT).map((part, i) =>
        FULL.test(part) ? (
          <AppText key={i} variant="body" color="primary" onPress={() => onTag(part.slice(1).toLowerCase())}>
            {part}
          </AppText>
        ) : (
          part
        ),
      )}
    </AppText>
  );
}
