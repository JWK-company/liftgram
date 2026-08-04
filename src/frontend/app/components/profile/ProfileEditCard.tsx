"use client";
// @plm SRS-011  프로필 편집 — app의 features/profile/ProfileEditCard.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 표시 이름과 사진은 **남이 보는 값**이다(피드·댓글·DM·코칭 검색). 그래서 로컬이 아니라
// 서버 프로필에 적는다 — 계정에 붙어 다녀야 다른 기기에서도 같은 이름으로 보인다.
//
// ── 사진은 고르는 즉시 저장한다 ─────────────────────────────────────────────
// 고르고 나서 또 "저장"을 눌러야 하면, 고른 뒤 화면을 옮긴 사람은 바뀐 줄 안다.
// 이름은 반대다 — 타이핑 중에 저장하면 중간 이름("김", "김철")이 남에게 보인다.
//
// ── 이름이 그대로면 저장 버튼이 살아나지 않는다 ─────────────────────────────
// 누를 수 있는데 아무 일도 없는 버튼은, 눌러 보고 나서야 그걸 알게 한다.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { t } from "@/lib/i18n";
import { uploadImage } from "@/lib/mediaClient";
import { useAuth } from "../AuthProvider";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { TextField } from "../ui/inputs";
import { AppText, Card, SectionHeader } from "../ui/primitives";

export function ProfileEditCard() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  if (!user) return null;

  async function run(fn: () => Promise<void>) {
    if (saving) return;
    setSaving(true);
    setStatus(null);
    setFailed(false);
    try {
      await fn();
      setStatus(t("profileEdit.saved"));
    } catch {
      setStatus(t("profileEdit.saveFailed"));
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const dirty = name.trim() !== (user.displayName ?? "");

  return (
    <>
      <SectionHeader title={t("profileEdit.title")} />
      <Card className="mb-[var(--spacing-lg)]" data-testid="profile-edit">
        <div className="flex items-center gap-[var(--spacing-md)]">
          <Avatar name={user.displayName} url={user.avatarUrl} size={56} />
          <label className="flex-1">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              data-testid="avatar-file"
              disabled={saving}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ""; // 같은 파일을 다시 고를 수 있게
                if (!f) return;
                // 고르는 즉시 올리고 저장한다 — 한 번 더 누르게 하면 바뀐 줄 알고 떠난다.
                void run(async () => {
                  const url = await uploadImage(f);
                  await updateProfile({ avatarUrl: url, setAvatarUrl: true });
                });
              }}
            />
            <span className="flex h-[42px] items-center justify-center rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface-alt)">
              <AppText variant="body" color={saving ? "textMuted" : "text"}>
                {t("profileEdit.changePhoto")}
              </AppText>
            </span>
          </label>
        </div>

        <div className="mt-[var(--spacing-md)]">
          <TextField
            label={t("profileEdit.nameLabel")}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            testId="profile-name-input"
          />
          <Button
            title={t("profileEdit.save")}
            loading={saving}
            disabled={!dirty}
            onPress={() => void run(() => updateProfile({ displayName: name.trim(), setDisplayName: true }))}
            testId="btn-save-profile"
          />
        </div>

        {status ? (
          <AppText
            variant="caption"
            color={failed ? "danger" : "textMuted"}
            className="mt-[var(--spacing-sm)] block"
            data-testid="profile-edit-status"
          >
            {status}
          </AppText>
        ) : null}
      </Card>
    </>
  );
}
