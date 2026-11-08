#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""대기열 규칙 단위 시험(GPU 없이). 사용: python3 test_run.py"""
import tempfile, threading, types, unittest, run as R
INFO = dict(fail=[], iou_min=1, hole_max=0, skin_max=0, kb=1)
def boom(k, E, f): raise RuntimeError("x")
def mk(g, jobs, res, stop, one, foreign=()):
    a = types.SimpleNamespace(out=tempfile.gettempdir(), _code=R.code_now()); w = R.Worker(g, a, jobs, {}, res, stop); w.one = one; w.foreign = (foreign if callable(foreign) else lambda: list(foreign)); return w
def q(*keys): return R.Jobs([(k, {}, "fp") for k in keys])
class CodeGuard(unittest.TestCase):
    def test_code_change_stops_all(self):
        j, res, st = R.Jobs([("a", {}, "f")]), R.Results(), threading.Event()
        w = mk(0, j, res, st, lambda *_: {"fail": []}); w.args._code = "다른 값"; w.run()
        self.assertTrue(st.is_set()); self.assertEqual(res.by, {}); self.assertTrue(res.events)
class T(unittest.TestCase):
    def setUp(self):
        old = R.shutil.disk_usage; self.addCleanup(lambda: setattr(R.shutil, "disk_usage", old)); R.shutil.disk_usage = lambda p: types.SimpleNamespace(free=1e12)
    def test_retry_goes_to_other_gpu(self):
        j, res, st = q("a"), R.Results(), threading.Event(); seen = []
        def bad(k, E, f): seen.append(0); raise RuntimeError("x")
        def good(k, E, f): seen.append(1); return INFO
        a, b = mk(0, j, res, st, bad), mk(1, j, res, st, good); a.start(); b.start(); a.join(9); b.join(9)
        self.assertEqual(seen, [0, 1]); self.assertEqual(res.by["a"][0], "합격")
    def test_failed_on_two_gpus_is_recorded(self):
        j, res, st = q("a"), R.Results(), threading.Event(); a, b = mk(0, j, res, st, boom), mk(1, j, res, st, boom); a.start(); b.start(); a.join(9); b.join(9)
        self.assertEqual(res.by["a"][0], "실패"); self.assertEqual(j.left(), [])
    def test_two_consecutive_failures_stop_worker(self):
        j, res, st = q("a", "b", "c"), R.Results(), threading.Event(); calls = []
        def bad(k, E, f): calls.append(k); raise RuntimeError("x")
        mk(0, j, res, st, bad).run(); self.assertEqual(len(calls), 2); self.assertEqual(len(j.left()), 3)
    def test_single_gpu_leaves_failed_key_named(self):
        j, res, st = q("a"), R.Results(), threading.Event(); mk(0, j, res, st, boom).run(); self.assertEqual(j.left(), ["a"])
    def test_foreign_process_returns_job_not_result(self):
        j, res, st = q("a"), R.Results(), threading.Event(); mk(0, j, res, st, lambda *_: INFO, foreign=["123"]).run()
        self.assertEqual(j.left(), ["a"]); self.assertEqual(res.by, {}); self.assertEqual(len(res.events), 1)
    def test_returned_job_then_success_is_ok(self):
        j, res, st = q("a"), R.Results(), threading.Event(); mk(0, j, res, st, lambda *_: INFO, foreign=["123"]).run(); mk(1, j, res, st, lambda *_: INFO).run()
        self.assertEqual(res.by["a"][0], "합격")
    def test_foreign_check_error_keeps_key(self):
        j, res, st = q("a"), R.Results(), threading.Event()
        def err(): raise FileNotFoundError("nvidia-smi")
        mk(0, j, res, st, lambda *_: INFO, foreign=err).run(); self.assertEqual(j.left(), ["a"])
    def test_low_disk_stops_everything(self):
        j, res, st = q("a"), R.Results(), threading.Event(); R.shutil.disk_usage = lambda p: types.SimpleNamespace(free=1e9); mk(0, j, res, st, lambda *_: INFO).run()
        self.assertTrue(st.is_set()); self.assertEqual(j.left(), ["a"])
unittest.main()
