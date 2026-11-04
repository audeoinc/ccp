"""差分の一覧(scripts/client-diff.mjs)を、一時の Git リポジトリで流す。AWS 側と同じく、CCP はリポジトリの中の ccp/ にある形。"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(shutil.which("node") and shutil.which("git"), "node か git がない")
class ClientDiffTest(unittest.TestCase):
    def setUp(self) -> None:
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.repo = Path(d.name)
        self.ccp = self.repo / "ccp"
        self._git("init", "-q", "-b", "vendor")
        self._write("src/App.tsx", "a\n")
        self._write("server/ccp/main.py", "a\n")
        self._write("server/ccp/old.py", "a\n")
        (self.repo / "outside.txt").write_text("a\n", encoding="utf-8")
        self._commit()
        self._git("switch", "-q", "-c", "main")

    def _git(self, *args: str) -> None:
        subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args], cwd=self.repo, check=True, capture_output=True)

    def _write(self, path: str, text: str) -> None:
        p = self.ccp / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def _commit(self) -> None:
        self._git("add", "-A")
        self._git("commit", "-q", "-m", "x")

    def _run(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["node", str(ROOT / "scripts" / "client-diff.mjs"), *args], cwd=self.ccp, capture_output=True, encoding="utf-8")

    def test_no_changes(self) -> None:
        out = self._run()
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("足した所(マージでぶつかりにくい): 0 個", out.stdout)
        self.assertIn("共通のコードを変えた所(マージでぶつかりうる): 0 個", out.stdout)

    def test_separates_added_and_common(self) -> None:
        self._write("src/client/models/products.ts", "a\n")
        self._write("server/ccp/client/schema.json", "{}\n")
        self._write("src/NewPage.tsx", "a\n")
        self._write("src/App.tsx", "b\n")
        (self.ccp / "server/ccp/old.py").unlink()
        (self.repo / "outside.txt").write_text("b\n", encoding="utf-8")
        self._commit()
        out = self._run().stdout
        added, common = out.split("共通のコードを変えた所")
        self.assertIn("src/client/models/products.ts", added)
        self.assertIn("server/ccp/client/schema.json", added)
        self.assertIn("src/NewPage.tsx(AWS 側の場所の外", added)
        self.assertIn("変えた: src/App.tsx", common)
        self.assertIn("消した: server/ccp/old.py", common)
        self.assertNotIn("outside.txt", out)  # ccp/ の外は、版のマージと関係しない

    def test_uncommitted_changes_are_listed(self) -> None:
        self._write("src/App.tsx", "b\n")
        self.assertIn("変えた: src/App.tsx", self._run().stdout)

    def test_tells_what_is_not_in_changes_md(self) -> None:
        self._write("src/App.tsx", "b\n")
        self._write("server/ccp/main.py", "b\n")
        self._write("docs/client/CHANGES.md", "- src/App.tsx: 呼び出しを足した\n")
        self._commit()
        out = self._run().stdout
        self.assertIn("変えた: src/App.tsx\n", out)
        self.assertIn("変えた: server/ccp/main.py  ← CHANGES.md にありません", out)
        self.assertIn("次にやること", out)
        self.assertIn("1 個", out.split("次にやること")[1])

    def test_missing_base_stops_with_next_step(self) -> None:
        out = self._run("nothing")
        self.assertEqual(out.returncode, 1)
        self.assertIn("nothing がありません", out.stderr)
        self.assertIn("次にやること", out.stderr)


if __name__ == "__main__":
    unittest.main()
