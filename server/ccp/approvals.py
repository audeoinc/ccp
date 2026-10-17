"""承認の依頼・承認・差し戻し(バックログ U3・U4。設計は docs/APPROVAL.md の 4 章)。

  POST /api/approvals/requests                  承認を依頼する(承認グループ・人を指名し、決まり 全員 / 1 人 を選ぶ)
  POST /api/approvals/requests/{id}/decide      承認する(approved)/ 差し戻す(changes_requested。理由は必須)
  POST /api/approvals/requests/{id}/withdraw    依頼を取り下げる(依頼した人だけ)
  POST /api/approvals/reset                     承認済み・依頼中の内容が変わったので、いまの依頼を「古い」にする

画面から表を直接書かず、ここで行う理由:
  - 「承認できるのは指名された本人だけ」「自分の依頼は承認できない」の確かめは、ログインが入ったら、サーバーでしか守れない。
    いまは、画面が送ってきた「あなた」(users の id と名前)を信じる(ログインが入ったら、ここだけを直す)
  - 承認者の行の更新・決まりの判定・配信のステータス・操作の履歴(events)・差し戻しのコメントを、1 つのトランザクションで行う
判定(request_outcome・eligible_reviewers)は、画面の src/approvals.ts と同じ。例 tests/approval_cases.json で、両方を確かめる。
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from . import schema as sc
from .data_api import _columns_sql, db, fail, ok, require_db

router = APIRouter(prefix="/api/approvals", dependencies=[Depends(require_db)])

LIVE = ("open", "approved", "changes_requested")  # まだ生きている依頼(古い・取り下げ 以外)


# ---- 判定(画面の src/approvals.ts と同じ)


def request_outcome(rule: str, decisions: list[str | None]) -> str:
    """依頼の結果。1 人でも差し戻したら止める。全員 = それぞれから承認、1 人 = だれか 1 人"""
    if any(d == "changes_requested" for d in decisions):
        return "changes_requested"
    if not decisions:
        return "open"
    approved = sum(1 for d in decisions if d == "approved")
    done = approved >= 1 if rule == "any" else approved == len(decisions)
    return "approved" if done else "open"


def eligible_reviewers(reviewers: list[dict[str, Any]], actor_id: str, actor_groups: list[str], requester_id: str | None) -> list[str]:
    """その人が決められる、未定の相手(行の id)。本人を指名した行 → グループの行の順。依頼した本人は不可"""
    if not actor_id or actor_id == requester_id:
        return []
    groups = set(actor_groups)
    pending = [r for r in reviewers if (r.get("decision") or "pending") == "pending"]
    direct = [r["id"] for r in pending if r.get("user_id") == actor_id]
    via_group = [r["id"] for r in pending if not r.get("user_id") and r.get("approval_group_id") in groups]
    return direct + via_group


# ---- DB の小さな道具(schema.json の表の定義で、値を確かめてから書く)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _insert(conn: AsyncConnection, table: str, record: dict[str, Any]) -> dict[str, Any]:
    t = sc.load().table(table)
    values = t.to_db(record)
    cols = list(values)
    sql = f"INSERT INTO {t.pg} ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)}) RETURNING {_columns_sql(t, None)}"
    return t.to_api(dict((await conn.execute(text(sql), values)).mappings().one()))


async def _update(conn: AsyncConnection, table: str, row_id: str, record: dict[str, Any]) -> dict[str, Any] | None:
    t = sc.load().table(table)
    values = t.to_db(record)
    sets = [f"{c} = :{c}" for c in values] + ["modified_on = now()"]
    sql = f"UPDATE {t.pg} SET {', '.join(sets)} WHERE id = :_id RETURNING {_columns_sql(t, None)}"
    row = (await conn.execute(text(sql), {**values, "_id": sc.coerce("uuid", row_id)})).mappings().first()
    return t.to_api(dict(row)) if row else None


async def _select(conn: AsyncConnection, table: str, where: str, params: dict[str, Any], order: str = "created_on") -> list[dict[str, Any]]:
    t = sc.load().table(table)
    rows = (await conn.execute(text(f"SELECT {_columns_sql(t, None)} FROM {t.pg} WHERE {where} ORDER BY {order}"), params)).mappings().all()
    return [t.to_api(dict(r)) for r in rows]


async def _one(conn: AsyncConnection, table: str, row_id: str, lock: bool = False) -> dict[str, Any] | None:
    t = sc.load().table(table)
    sql = f"SELECT {_columns_sql(t, None)} FROM {t.pg} WHERE id = :id" + (" FOR UPDATE" if lock else "")
    row = (await conn.execute(text(sql), {"id": sc.coerce("uuid", row_id)})).mappings().first()
    return t.to_api(dict(row)) if row else None


async def _actor_groups(conn: AsyncConnection, user_id: str) -> list[str]:
    rows = (await conn.execute(text("SELECT approval_group_id FROM approval_group_members WHERE user_id = :u ORDER BY created_on"), {"u": sc.coerce("uuid", user_id)})).all()
    return [str(r[0]) for r in rows]


async def _set_card_status(conn: AsyncConnection, card_id: str, status: str) -> None:
    await conn.execute(text("UPDATE delivery_cards SET status = :s, modified_on = now() WHERE id = :id"), {"s": status, "id": sc.coerce("uuid", card_id)})


async def _event(conn: AsyncConnection, action: str, actor: dict[str, str], card: dict[str, Any], week_start: str | None, from_status: str | None, to_status: str | None, note: str | None) -> None:
    """操作の履歴(W6)。配信カードで承認したときと同じ形で残す"""
    await _insert(
        conn,
        "events",
        {
            "action": action,
            "week_start": week_start,
            "delivery_card_id": card["id"],
            "card_name": card.get("name"),
            "from_status": from_status,
            "to_status": to_status,
            "actor": actor["name"],
            "note": note,
        },
    )


async def _body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except ValueError as e:
        raise sc.BadRequest("本文が正しい JSON(UTF-8)ではありません") from e
    if not isinstance(body, dict):
        raise sc.BadRequest("本文は、オブジェクトで指定してください")
    return body


def _actor(body: dict[str, Any], request: Request) -> dict[str, str]:
    """操作した人。画面が選んだ「あなた」(users の id と名前)。名前は、なければ x-ccp-actor の見出しから"""
    a = body.get("actor") or {}
    user_id = str(a.get("id") or "").strip()
    name = str(a.get("name") or unquote(request.headers.get("x-ccp-actor", ""))).strip()[:100]
    if not user_id:
        raise sc.BadRequest("「あなた」を選んでください(承認の依頼・承認には、ユーザーの選択が要ります)")
    sc.coerce("uuid", user_id)
    return {"id": user_id, "name": name}


def _view(req: dict[str, Any], reviewers: list[dict[str, Any]]) -> dict[str, Any]:
    return {"request": req, "reviewers": reviewers}


async def _stale_live_requests(conn: AsyncConnection, card_id: str, now: datetime) -> int:
    """その配信の生きている依頼を、古いものにする(依頼し直し・内容の変更)。戻り値は、古くした数"""
    r = await conn.execute(
        text("UPDATE approval_requests SET status = 'stale', closed_at = :now, modified_on = now() WHERE delivery_card_id = :c AND status IN ('open', 'approved', 'changes_requested')"),
        {"now": now, "c": sc.coerce("uuid", card_id)},
    )
    return r.rowcount or 0


# ---- 窓口


@router.post("/requests")
async def create_request(request: Request):
    body = await _body(request)
    actor = _actor(body, request)
    card_id = str(body.get("delivery_card_id") or "")
    rule = str(body.get("rule") or "all")
    group_ids = [str(x) for x in (body.get("group_ids") or []) if x]
    user_ids = [str(x) for x in (body.get("user_ids") or []) if x]
    note = (str(body.get("note") or "")).strip() or None
    week_start = body.get("week_start") or None
    if rule not in ("all", "any"):
        return fail(400, "決まりは all か any です")
    if not group_ids and not user_ids:
        return fail(400, "承認グループか承認者を、1 つ以上選んでください")
    if actor["id"] in user_ids:
        return fail(400, "自分を承認者にはできません(自分で依頼した配信は、自分では承認できません)")
    now = _now()
    async with db(write=True) as conn:
        card = await _one(conn, "delivery_cards", card_id, lock=True)
        if card is None:
            return fail(404, "配信カードが見つかりません")
        if card.get("status") == "confirmed":
            return fail(400, "確定した週の配信です。変えるときは、配信カードで理由を入れて保存してください(週がレビューに戻ります)")
        # 相手の名前は、その時のものを残す(グループ・人を消しても、記録が読めるように)
        reviewers_in: list[dict[str, Any]] = []
        for gid in dict.fromkeys(group_ids):
            g = await _one(conn, "approval_groups", gid)
            if g is None or (g.get("status") or "active") != "active":
                return fail(400, "使えない承認グループが含まれています(消された、または無効)")
            reviewers_in.append({"approval_group_id": gid, "reviewer_name": g.get("name")})
        for uid in dict.fromkeys(user_ids):
            u = await _one(conn, "users", uid)
            if u is None or (u.get("status") or "active") != "active":
                return fail(400, "使えない承認者が含まれています(消された、または無効)")
            reviewers_in.append({"user_id": uid, "reviewer_name": u.get("name")})
        await _stale_live_requests(conn, card_id, now)
        req = await _insert(
            conn,
            "approval_requests",
            {
                "delivery_card_id": card_id,
                "card_name": card.get("name"),
                "requested_by": actor["id"],
                "requested_by_name": actor["name"],
                "rule": rule,
                "status": "open",
                "requested_at": now,
                "note": note,
            },
        )
        reviewers = [await _insert(conn, "approval_reviewers", {**r, "approval_request_id": req["id"], "decision": "pending"}) for r in reviewers_in]
        # 依頼が出た配信は「承認待ち」(reviewing)。承認済みの配信を依頼し直したときも、承認待ちに戻る
        before = card.get("status") or "not_started"
        if before != "reviewing":
            await _set_card_status(conn, card_id, "reviewing")
        names = " / ".join(str(r.get("reviewer_name") or "") for r in reviewers)
        await _event(conn, "request", actor, card, week_start, before, "reviewing", f"{names}({'全員' if rule == 'all' else '1 人'})" + (f" — {note}" if note else ""))
    return ok(_view(req, reviewers))


@router.post("/requests/{request_id}/decide")
async def decide(request_id: str, request: Request):
    body = await _body(request)
    actor = _actor(body, request)
    decision = str(body.get("decision") or "")
    note = (str(body.get("note") or "")).strip() or None
    wanted = str(body.get("reviewer_id") or "") or None
    week_start = body.get("week_start") or None
    if decision not in ("approved", "changes_requested"):
        return fail(400, "decision は approved か changes_requested です")
    if decision == "changes_requested" and not note:
        return fail(400, "差し戻しには、理由が要ります")
    now = _now()
    async with db(write=True) as conn:
        req = await _one(conn, "approval_requests", request_id, lock=True)
        if req is None:
            return fail(404, "承認の依頼が見つかりません")
        if req.get("status") != "open":
            return fail(409, "この依頼は、もう受け付けていません(承認済み・差し戻し・古い依頼・取り下げ)")
        if actor["id"] == req.get("requested_by"):
            return fail(403, "自分で依頼した配信は、自分では承認できません")
        reviewers = await _select(conn, "approval_reviewers", "approval_request_id = :r", {"r": sc.coerce("uuid", request_id)})
        able = eligible_reviewers(reviewers, actor["id"], await _actor_groups(conn, actor["id"]), req.get("requested_by"))
        if not able:
            return fail(403, "この配信の承認者に指名されていません(または、もう決めています)")
        if wanted is not None and wanted not in able:
            return fail(403, "その相手の分は、あなたは決められません")
        target = wanted or able[0]
        updated = await _update(conn, "approval_reviewers", target, {"decision": decision, "decided_by": actor["id"], "decided_by_name": actor["name"], "decided_at": now, "note": note})
        reviewers = [updated if r["id"] == target else r for r in reviewers if updated is not None]
        outcome = request_outcome(str(req.get("rule") or "all"), [r.get("decision") for r in reviewers])
        card = await _one(conn, "delivery_cards", str(req["delivery_card_id"]), lock=True)
        if card is None:
            return fail(404, "配信カードが見つかりません")
        before = card.get("status") or "not_started"
        slot = str((updated or {}).get("reviewer_name") or "")
        if outcome == "approved":
            req = await _update(conn, "approval_requests", request_id, {"status": "approved", "closed_at": now}) or req
            await _set_card_status(conn, card["id"], "approved")
            await _event(conn, "approve", actor, card, week_start, before, "approved", f"{slot} — これで承認がそろった")
        elif outcome == "changes_requested":
            req = await _update(conn, "approval_requests", request_id, {"status": "changes_requested", "closed_at": now}) or req
            # 差し戻しの理由は、レビューのコメント(W5)にも残す(対応済みにするまで、未対応として数える)
            await _insert(conn, "card_notes", {"delivery_card_id": card["id"], "kind": "comment", "author": actor["name"], "body": note, "resolved": 0})
            await _event(conn, "reject", actor, card, week_start, before, before, f"{slot} — {note}")
        else:
            await _event(conn, "approve", actor, card, week_start, before, before, f"{slot}(ほかの相手の承認待ち)")
    return ok(_view(req, reviewers))


@router.post("/requests/{request_id}/withdraw")
async def withdraw(request_id: str, request: Request):
    body = await _body(request)
    actor = _actor(body, request)
    note = (str(body.get("note") or "")).strip() or None
    week_start = body.get("week_start") or None
    now = _now()
    async with db(write=True) as conn:
        req = await _one(conn, "approval_requests", request_id, lock=True)
        if req is None:
            return fail(404, "承認の依頼が見つかりません")
        if req.get("status") not in ("open", "changes_requested"):
            return fail(409, "この依頼は、取り下げられません(承認済み・古い依頼・取り下げ)")
        if actor["id"] != req.get("requested_by"):
            return fail(403, "依頼を取り下げられるのは、依頼した人だけです")
        req = await _update(conn, "approval_requests", request_id, {"status": "withdrawn", "closed_at": now}) or req
        reviewers = await _select(conn, "approval_reviewers", "approval_request_id = :r", {"r": sc.coerce("uuid", request_id)})
        card = await _one(conn, "delivery_cards", str(req["delivery_card_id"]), lock=True)
        if card is not None:
            # 承認待ちだった配信は、依頼がなくなるので「未起案」に戻す(承認済みなど、ほかの状態はそのまま)
            before = card.get("status") or "not_started"
            after = "not_started" if before == "reviewing" else before
            if after != before:
                await _set_card_status(conn, card["id"], after)
            await _event(conn, "withdraw", actor, card, week_start, before, after, note)
    return ok(_view(req, reviewers))


@router.post("/reset")
async def reset(request: Request):
    """内容が変わった(承認後の変更・確定後の変更)ので、生きている依頼を古いものにする。配信のステータス・履歴は、画面が保存のときに書く"""
    body = await _body(request)
    card_id = str(body.get("delivery_card_id") or "")
    if not card_id:
        return fail(400, "delivery_card_id が要ります")
    async with db(write=True) as conn:
        n = await _stale_live_requests(conn, card_id, _now())
    return ok({"stale": n})
