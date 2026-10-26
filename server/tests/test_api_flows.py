"""窓口を、偽の DB(tests/fakes.py)で通して確かめる: 承認(/api/approvals)・制作(/api/production)・汎用の書き込み(/api/data)・Basic 認証。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import base64
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from ccp import approvals, data_api, production  # noqa: E402
from fakes import FakeStore  # noqa: E402


def make_client(*routers) -> TestClient:
    app = FastAPI()
    data_api.register_errors(app)
    for r in routers:
        app.include_router(r)
    return TestClient(app)


class Base(unittest.TestCase):
    def setUp(self) -> None:
        # ログインなし(画面が選んだ「あなた」で動く)。DB の起動の仕組みもなし
        env = mock.patch.dict(os.environ, {"CCP_DEV_USER_EMAIL": "", "CCP_IAP_AUDIENCE": ""})
        env.start()
        self.addCleanup(env.stop)
        self.store = FakeStore()
        p = self.store.patch("ccp.approvals", "ccp.production", "ccp.data_api")
        p.__enter__()
        self.addCleanup(p.__exit__, None, None, None)
        s = self.store
        self.requester = s.add("users", name="依頼する人", email="req@example.com", status="active")
        self.reviewer = s.add("users", name="承認する人", email="rev@example.com", status="active")
        self.other = s.add("users", name="ほかの人", email="other@example.com", status="active")
        self.card = s.add("delivery_cards", name="秋の特集", status="not_started")
        self.client = make_client(approvals.router, production.router, data_api.router)

    def actor(self, uid: str, **body):
        return {"actor": {"id": uid, "name": self.store.row("users", uid)["name"]}, **body}

    def request_review(self) -> str:
        r = self.client.post("/api/approvals/requests", json=self.actor(self.requester, delivery_card_id=self.card, rule="all", user_ids=[self.reviewer]))
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["data"]["request"]["id"]


class ApprovalFlowTest(Base):
    def test_request_sets_reviewing_and_notifies_reviewer(self) -> None:
        rid = self.request_review()
        s = self.store
        self.assertEqual(s.row("approval_requests", rid)["status"], "open")
        self.assertEqual([r["decision"] for r in s.rows("approval_reviewers", approval_request_id=rid)], ["pending"])
        self.assertEqual(s.row("delivery_cards", self.card)["status"], "reviewing")
        self.assertEqual([n["email"] for n in s.rows("notifications")], ["rev@example.com"])
        self.assertEqual([e["action"] for e in s.rows("events")], ["request"])

    def test_approve_by_reviewer(self) -> None:
        rid = self.request_review()
        r = self.client.post(f"/api/approvals/requests/{rid}/decide", json=self.actor(self.reviewer, decision="approved"))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.store.row("approval_requests", rid)["status"], "approved")
        self.assertEqual(self.store.row("delivery_cards", self.card)["status"], "approved")
        # 依頼した人に「承認されました」
        self.assertIn("req@example.com", [n["email"] for n in self.store.rows("notifications", kind="approved")])

    def test_not_a_reviewer_is_refused_and_nothing_is_written(self) -> None:
        rid = self.request_review()
        before = self.store.rollbacks
        r = self.client.post(f"/api/approvals/requests/{rid}/decide", json=self.actor(self.other, decision="approved"))
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.store.rollbacks, before + 1)
        self.assertEqual(self.store.row("approval_requests", rid)["status"], "open")

    def test_send_back_needs_a_reason_and_leaves_a_comment(self) -> None:
        rid = self.request_review()
        r = self.client.post(f"/api/approvals/requests/{rid}/decide", json=self.actor(self.reviewer, decision="changes_requested"))
        self.assertEqual(r.status_code, 400)
        r = self.client.post(f"/api/approvals/requests/{rid}/decide", json=self.actor(self.reviewer, decision="changes_requested", note="画像を差し替えて"))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.store.row("approval_requests", rid)["status"], "changes_requested")
        self.assertEqual([n["body"] for n in self.store.rows("card_notes")], ["画像を差し替えて"])

    def test_closed_request_is_refused(self) -> None:
        rid = self.request_review()
        self.client.post(f"/api/approvals/requests/{rid}/decide", json=self.actor(self.reviewer, decision="approved"))
        r = self.client.post(f"/api/approvals/requests/{rid}/decide", json=self.actor(self.reviewer, decision="approved"))
        self.assertEqual(r.status_code, 409)

    def test_only_requester_can_withdraw(self) -> None:
        rid = self.request_review()
        self.assertEqual(self.client.post(f"/api/approvals/requests/{rid}/withdraw", json=self.actor(self.other)).status_code, 403)
        r = self.client.post(f"/api/approvals/requests/{rid}/withdraw", json=self.actor(self.requester))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.store.row("approval_requests", rid)["status"], "withdrawn")
        self.assertEqual(self.store.row("delivery_cards", self.card)["status"], "not_started")

    def test_confirmed_card_cannot_be_requested(self) -> None:
        self.store.row("delivery_cards", self.card)["status"] = "confirmed"
        r = self.client.post("/api/approvals/requests", json=self.actor(self.requester, delivery_card_id=self.card, user_ids=[self.reviewer]))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.store.rows("approval_requests"), [])

    def test_reset_makes_live_requests_stale(self) -> None:
        rid = self.request_review()
        pid = self.store.add("production_requests", delivery_card_id=self.card, version=1, status="in_progress")
        r = self.client.post("/api/approvals/reset", json={"delivery_card_id": self.card})
        self.assertEqual(r.json()["data"], {"stale": 1})
        self.assertEqual(self.store.row("approval_requests", rid)["status"], "stale")
        self.assertEqual(self.store.row("production_requests", pid)["status"], "stale")


    def test_clear_card_deletes_requests_of_that_card_only(self) -> None:
        # 作り直したカード(X79 の段 ⑤)の依頼は消す。汎用の窓口は 403 で断るので、この窓口で(2026-10-26 本番で消えずに残った)
        rid = self.request_review()
        pid = self.store.add("production_requests", delivery_card_id=self.card, version=1, status="in_progress")
        other = self.store.add("delivery_cards", name="ほかの配信", status="not_started")
        keep = self.store.add("production_requests", delivery_card_id=other, version=1, status="requested")
        r = self.client.post("/api/approvals/clear-card", json={"delivery_card_id": self.card})
        self.assertEqual(r.json()["data"], {"approval_requests": 1, "production_requests": 1})
        self.assertIsNone(self.store.row("approval_requests", rid))
        self.assertIsNone(self.store.row("production_requests", pid))
        self.assertIsNotNone(self.store.row("production_requests", keep))
        self.assertEqual(self.client.post("/api/approvals/clear-card", json={}).status_code, 400)


class ProductionFlowTest(Base):
    def test_request_receive_and_refuse_twice(self) -> None:
        old = self.store.add("production_requests", delivery_card_id=self.card, version=1, status="requested")
        r = self.client.post("/api/production/requests", json=self.actor(self.requester, delivery_card_id=self.card, snapshot={"subject": "件名"}))
        self.assertEqual(r.status_code, 200, r.text)
        row = r.json()["data"]
        self.assertEqual((row["version"], row["status"]), (2, "requested"))
        # 前の版は古い版に
        self.assertEqual(self.store.row("production_requests", old)["status"], "stale")
        r = self.client.post(f"/api/production/requests/{row['id']}/receive", json=self.actor(self.other))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["data"]["status"], "in_progress")
        self.assertEqual(r.json()["data"]["received_by_name"], "ほかの人")
        self.assertEqual(self.client.post(f"/api/production/requests/{row['id']}/receive", json=self.actor(self.other)).status_code, 409)

    def test_snapshot_is_required(self) -> None:
        r = self.client.post("/api/production/requests", json=self.actor(self.requester, delivery_card_id=self.card))
        self.assertEqual(r.status_code, 400)


class DataWriteTest(Base):
    def test_locked_table_is_refused_without_writing(self) -> None:
        r = self.client.post("/api/data/approval_requests", json={"status": "approved"})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.store.rows("approval_requests"), [])

    def test_create_update_delete_and_change_log(self) -> None:
        r = self.client.post("/api/data/delivery_cards", json={"name": "冬の特集", "status": "not_started"})
        self.assertEqual(r.status_code, 200, r.text)
        cid = r.json()["data"]["id"]
        r = self.client.patch(f"/api/data/delivery_cards/{cid}", json={"name": "冬の大特集"}, headers={"x-ccp-actor": "%E5%A4%AA%E9%83%8E"})
        self.assertEqual(r.json()["data"]["name"], "冬の大特集")
        logs = self.store.rows("change_logs", delivery_card_id=cid)
        self.assertEqual([(x["kind"], x["field"], x["before_value"], x["after_value"], x["actor"]) for x in logs], [("edit", "name", "冬の特集", "冬の大特集", "太郎")])
        self.assertEqual(self.client.delete(f"/api/data/delivery_cards/{cid}").status_code, 200)
        self.assertIsNone(self.store.row("delivery_cards", cid))

    def test_unknown_column_and_bad_choice(self) -> None:
        self.assertEqual(self.client.post("/api/data/delivery_cards", json={"nope": 1}).status_code, 400)
        self.assertEqual(self.client.post("/api/data/delivery_cards", json={"channel": "fax"}).status_code, 400)

    def test_missing_row_is_404(self) -> None:
        r = self.client.patch("/api/data/delivery_cards/00000000-0000-0000-0000-000000000001", json={"name": "x"})
        self.assertEqual(r.status_code, 404)


class PeopleAdminTest(Base):
    """ユーザー・承認グループなどの書き込みは、ログインしているときは管理者だけ(ログインなしは、だれでも)"""

    def signed_in(self, email: str):  # noqa: ANN201
        p = mock.patch.dict(os.environ, {"CCP_DEV_USER_EMAIL": email})
        p.start()
        self.addCleanup(p.stop)

    def test_signed_out_anyone_can_edit(self) -> None:
        r = self.client.post("/api/data/users", json={"name": "新しい人"})
        self.assertEqual(r.status_code, 200, r.text)

    def test_member_is_refused_without_writing(self) -> None:
        self.signed_in("req@example.com")
        before = len(self.store.rows("users"))
        r = self.client.post("/api/data/users", json={"name": "新しい人"})
        self.assertEqual(r.status_code, 403)
        self.assertIn("管理者だけ", r.json()["error"]["message"])
        self.assertEqual(self.client.patch(f"/api/data/users/{self.other}", json={"name": "x"}).status_code, 403)
        self.assertEqual(self.client.delete(f"/api/data/users/{self.other}").status_code, 403)
        self.assertEqual(len(self.store.rows("users")), before)
        self.assertEqual(self.store.row("users", self.other)["name"], "ほかの人")

    def test_unregistered_is_refused(self) -> None:
        self.signed_in("nobody@example.com")
        r = self.client.post("/api/data/approval_groups", json={"name": "班"})
        self.assertEqual(r.status_code, 403)
        self.assertIn("登録されていません", r.json()["error"]["message"])

    def test_admin_can_edit(self) -> None:
        self.store.row("users", self.reviewer)["role"] = "admin"
        # 大文字小文字は区別しない
        self.signed_in("REV@example.com")
        r = self.client.patch(f"/api/data/users/{self.other}", json={"name": "名前を直した"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.store.row("users", self.other)["name"], "名前を直した")

    def test_other_tables_are_not_limited(self) -> None:
        self.signed_in("req@example.com")
        r = self.client.post("/api/data/delivery_cards", json={"name": "冬の特集"})
        self.assertEqual(r.status_code, 200, r.text)


class BasicAuthTest(unittest.TestCase):
    def setUp(self) -> None:
        from ccp import main

        self.main = main
        p = mock.patch.object(main, "APP_PASSWORD", "secret-for-test")
        p.start()
        self.addCleanup(p.stop)
        self.client = TestClient(main.app)

    @staticmethod
    def auth(pw: str) -> dict[str, str]:
        return {"Authorization": "Basic " + base64.b64encode(f"anyone:{pw}".encode()).decode()}

    def test_ping_is_open(self) -> None:
        self.assertEqual(self.client.get("/ping").status_code, 200)

    def test_needs_password(self) -> None:
        r = self.client.get("/api/me")
        self.assertEqual(r.status_code, 401)
        self.assertIn("Basic", r.headers["www-authenticate"])
        self.assertEqual(self.client.get("/api/me", headers=self.auth("wrong")).status_code, 401)
        self.assertEqual(self.client.get("/api/me", headers={"Authorization": "Basic !!!"}).status_code, 401)

    def test_right_password_passes(self) -> None:
        with mock.patch.dict(os.environ, {"CCP_DEV_USER_EMAIL": "", "CCP_IAP_AUDIENCE": ""}):
            r = self.client.get("/api/me", headers=self.auth("secret-for-test"))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIsNone(r.json()["data"]["email"])


if __name__ == "__main__":
    unittest.main()
