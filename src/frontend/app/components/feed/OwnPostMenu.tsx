"use client";
// @plm SRS-007  내 글 메뉴 — app의 features/social/OwnPostMenu.tsx를 웹으로
//
// 고칠 수 있는 것은 **캡션뿐**이다(운동 기록은 그때의 사실이라 서버가 받지 않는다).
// 삭제는 되돌릴 수 없으므로 확인창을 한 번 세운다 — 좋아요·댓글이 함께 사라진다고 적는다.
import type { Post } from "@app/contracts";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { feedClient, feedErrorMessage } from "@/lib/feedClient";
import { Button } from "../ui/Button";
import { ActionSheet, ConfirmDialog, Overlay } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { TextArea } from "../ui/inputs";
import { AppText } from "../ui/primitives";

// 메뉴와 그 다음 창은 **따로** 센다. ActionSheet는 선택 직후 스스로 닫히는데(onPress → onClose),
// 한 변수로 두면 그 닫힘이 방금 연 편집창을 곧바로 덮어 버린다.
type Dialog = "edit" | "delete" | null;

export function OwnPostMenu({
  post,
  onUpdated,
  onDeleted,
}: {
  post: Post;
  onUpdated: (p: Post) => void;
  onDeleted: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [caption, setCaption] = useState(post.caption);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await feedClient().updatePost({ postId: post.id, caption: caption.trim() });
      if (res.post) onUpdated(res.post);
      setDialog(null);
    } catch (e) {
      setError(feedErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await feedClient().deletePost({ postId: post.id });
      onDeleted(post.id);
      setDialog(null);
    } catch (e) {
      setError(feedErrorMessage(e));
      setDialog(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label={t("post.edit")}
        data-testid="post-menu"
        className="pl-[var(--spacing-sm)]"
      >
        <Icon name="ellipsis-horizontal" size={18} color="var(--color-ink3)" />
      </button>

      {menuOpen ? (
        <ActionSheet
          title={t("post.edit")}
          onClose={() => setMenuOpen(false)}
          testId="post-menu-sheet"
          options={[
            {
              label: t("post.editTitle"),
              testId: "post-edit",
              onPress: () => {
                setCaption(post.caption);
                setDialog("edit");
              },
            },
            {
              label: t("post.delete"),
              destructive: true,
              testId: "post-delete",
              onPress: () => setDialog("delete"),
            },
          ]}
        />
      ) : null}

      {dialog === "edit" ? (
        <Overlay onClose={() => setDialog(null)} testId="post-edit-sheet">
          <AppText variant="heading">{t("post.editTitle")}</AppText>
          <div className="mt-[var(--spacing-md)]">
            <TextArea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t("feed.composePlaceholder")}
              testId="post-edit-caption"
            />
          </div>
          {error ? (
            <AppText variant="caption" color="danger">
              {error}
            </AppText>
          ) : null}
          <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
            <div className="flex-1">
              <Button title={t("common.cancel")} variant="secondary" onPress={() => setDialog(null)} />
            </div>
            <div className="flex-1">
              <Button title={t("post.save")} loading={busy} onPress={save} testId="post-edit-save" />
            </div>
          </div>
        </Overlay>
      ) : null}

      {dialog === "delete" ? (
        <ConfirmDialog
          title={t("post.deleteTitle")}
          message={t("post.deleteConfirm")}
          confirmLabel={t("post.delete")}
          destructive
          onCancel={() => setDialog(null)}
          onConfirm={remove}
          testId="post-delete-confirm"
        />
      ) : null}
    </>
  );
}
