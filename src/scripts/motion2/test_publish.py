#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""표 합치기 단위 시험. 사용: python3 test_publish.py"""
import unittest, publish as P
SRC = '// 머리 = {\nexport const EXERCISE_MOTION: Readonly<Record<string, string>> = {\n  "a": "old.1",\n  "c": "keep.2",\n};\nexport const X = {\n  y: 1,\n};\n'
CAT = dict(keys={"k+1": {}, "z": {}, "orphan": {}}, links={"a": "k+1", "b": "k+1", "c": "z"})
C = {"k+1": {"sha8": "abcd1234", "webp_sha8": "00000000", "판": "1", "답": "1"}}
class Rules(unittest.TestCase):
    def test_reason_rejects_source(self):
        for r in ("https://x.test/a", "어느 채널 영상과 다름", "@someone"):
            with self.assertRaises(SystemExit): P.clean_reason(r)
        self.assertEqual(P.clean_reason("무릎 각도 틀림"), "무릎 각도 틀림")
    def test_answer_is_number(self):
        with self.assertRaises(SystemExit): P.check_conf({"k": {"sha8": "abcd1234", "webp_sha8": "00000000", "판": "1", "답": "좋다고 함"}})
    def test_key_with_path_rejected(self):
        with self.assertRaises(SystemExit): P.check_conf({"../x": {"sha8": "abcd1234", "webp_sha8": "00000000", "판": "1", "답": "1"}})
    def test_export_existing_release_still_checks_info(self):
        import json, os, tempfile, types
        d = tempfile.mkdtemp(); k = "k"; os.makedirs(f"{d}/out/{k}"); os.makedirs(f"{d}/rel")
        open(f"{d}/rel/k.abcd1234.mp4", "wb").write(b"m"); open(f"{d}/rel/k.abcd1234.webp", "wb").write(b"w")
        s8, w8 = P.sha(f"{d}/rel/k.abcd1234.mp4"), P.sha(f"{d}/rel/k.abcd1234.webp"); os.rename(f"{d}/rel/k.abcd1234.mp4", f"{d}/rel/k.{s8}.mp4"); os.rename(f"{d}/rel/k.abcd1234.webp", f"{d}/rel/k.{s8}.webp")
        json.dump({k: {"sha8": s8, "webp_sha8": w8, "판": "1", "답": "1"}}, open(f"{d}/c.json", "w"))
        with self.assertRaises(SystemExit): P.do_export(types.SimpleNamespace(confirmed=f"{d}/c.json", release=f"{d}/rel", out=f"{d}/out"))   # 이번 제작의 검사 기록이 없으면 옛 판으로 본다
    def test_verify_catches_held_legacy(self):
        t = {"a": "k+1.old00001", "c": "z.keep0002"}
        self.assertEqual(P.verify(t, {}, ["k+1.old00001", "z.keep0002"], {"keys": ["k+1"]}), ["k+1.old00001"])
        self.assertEqual(P.verify(t, {}, ["k+1.old00001", "z.keep0002"], {"keys": [], "rejected": {"z": ["keep0002"]}}), ["z.keep0002"])
        self.assertEqual(P.verify(t, {}, ["k+1.old00001", "z.keep0002"]), [])
    def test_export_blocks_failed(self):
        import json, os, tempfile, types
        d = tempfile.mkdtemp(); k = "k"; os.makedirs(f"{d}/out/{k}")
        open(f"{d}/out/{k}/{k}.mp4", "wb").write(b"m"); open(f"{d}/out/{k}/thumb.webp", "wb").write(b"w"); s8, w8 = P.sha(f"{d}/out/{k}/{k}.mp4"), P.sha(f"{d}/out/{k}/thumb.webp")
        json.dump({k: {"sha8": s8, "webp_sha8": w8, "판": "1", "답": "1"}}, open(f"{d}/c.json", "w")); json.dump({"fail": ["윤곽"], "sha8": s8}, open(f"{d}/out/{k}/info.json", "w"))
        with self.assertRaises(SystemExit): P.do_export(types.SimpleNamespace(confirmed=f"{d}/c.json", release=f"{d}/rel", out=f"{d}/out"))
        json.dump({"fail": [], "sha8": s8}, open(f"{d}/out/{k}/info.json", "w")); P.do_export(types.SimpleNamespace(confirmed=f"{d}/c.json", release=f"{d}/rel", out=f"{d}/out")); self.assertEqual(len(os.listdir(f"{d}/rel")), 2)
class T(unittest.TestCase):
    def test_only_confirmed_ids_change(self):
        t, h, n = P.merge(CAT, C, P.read_table(SRC), ["k+1", "other"])
        self.assertEqual(t, {"a": "k-1.abcd1234", "b": "k-1.abcd1234", "c": "keep.2"}); self.assertEqual(h, ["other"]); self.assertEqual(n, 2)
    def test_rerun_changes_nothing(self):
        t, _, _ = P.merge(CAT, C, P.read_table(SRC), []); self.assertEqual(P.merge(CAT, C, t, [])[2], 0)
    def test_rest_of_file_survives(self):
        s = P.write_table(SRC, {"b": "x", "a": "y"}); self.assertEqual(P.read_table(s), {"a": "y", "b": "x"}); self.assertTrue(s.startswith("// 머리 = {")); self.assertIn("export const X = {\n  y: 1,\n};\n", s); self.assertLess(s.index('"a"'), s.index('"b"'))
    def test_odd_line_stops(self):
        for bad in ('  "a": "x", // 주석\n', "  'a': 'x',\n"):
            with self.assertRaises(SystemExit): P.read_table(SRC.replace('  "a": "old.1",\n', bad))
    def test_duplicate_id_stops(self):
        with self.assertRaises(SystemExit): P.read_table(SRC.replace('  "c": "keep.2",', '  "a": "keep.2",'))
    def test_unknown_and_unlinked_key_stop(self):
        for k in ("nope", "orphan"):
            with self.assertRaises(SystemExit): P.merge(CAT, {k: C["k+1"]}, {}, [])
    def test_conf_needs_fields(self):
        for bad in ({"sha8": "x", "webp_sha8": "00000000", "판": "1", "답": "m"}, {"sha8": "abcd1234", "webp_sha8": "00000000"}):
            with self.assertRaises(SystemExit): P.merge(CAT, {"k+1": bad}, {}, [])
    def test_held_key_in_table_stops(self):
        with self.assertRaises(SystemExit): P.merge(CAT, {}, {"c": "keep.2"}, ["z"])
    def test_take_down_blocks_same_version(self):
        t, _, _ = P.merge(CAT, C, P.read_table(SRC), [])
        t2, c2, h2 = P.take_down(CAT, C, t, {"keys": []}, "k+1", "손 모양")
        self.assertNotIn("a", t2); self.assertEqual(c2, {}); self.assertEqual(h2["rejected"]["k+1"], ["abcd1234"])
        with self.assertRaises(SystemExit): P.merge(CAT, C, t2, h2["keys"], h2["rejected"])
        C2 = {"k+1": dict(C["k+1"], sha8="ffffffff")}; t3, h3, _ = P.merge(CAT, C2, t2, h2["keys"], h2["rejected"]); self.assertEqual(t3["a"], "k-1.ffffffff"); self.assertEqual(h3, [])
    def test_verify(self):
        self.assertEqual(P.verify({"a": "old.1", "b": "k-1.abcd1234"}, C, ["old.1"]), []); self.assertEqual(P.verify({"a": "evil.2"}, C, ["old.1"]), ["evil.2"])
unittest.main()
