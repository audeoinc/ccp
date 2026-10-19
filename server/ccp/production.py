"""制作の依頼(バックログ PR2・PR5。設計は docs/PRODUCTION.md)。

  POST /api/production/requests               「この内容で制作に依頼する」(画面が作った写しを固めて保存する)
  POST /api/production/requests/{id}/receive  制作が「受け取った」
  POST /api/production/requests/{id}/done     制作が「制作が終わった」(ひとこと・できたもののリンクを任意で)
  POST /api/production/requests/{id}/html     直した HTML を保存する
  POST /api/production/requests/{id}/edits    左の要素(文言・メイン画像・商品・リンク先)を直した写しを保存する
  POST /api/production/requests/{id}/send     制作が終わった版を、配信のしくみに送る(工程の最後。いまは仮の窓口)
  POST /api/production/send                   制作を通さず、配信のしくみに送る(いまは送り先の窓口だけ。実際には送らずに「送りました」と返す)

写し(snapshot)は、画面が組み立てて送る(テンプレート・リンク先・計測用のパラメーターの決め方が、画面の側にあるため)。
サーバーは、配信が承認済みかを確かめ、版を数え、前の版を古くし、操作の履歴(events)を残す。
承認がやり直しになったら、approvals.py の /reset が、生きている版を古い版(stale)にする。
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from . import schema as sc
from .approvals import _actor, _body, _insert, _one, _update
from .data_api import db, fail, ok, require_db

router = APIRouter(prefix="/api/production", dependencies=[Depends(require_db)])

APPROVED = ("approved", "confirmed")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _event(conn: AsyncConnection, action: str, actor: dict[str, str], card: dict[str, Any], week_start: str | None, note: str | None) -> None:
    await _insert(conn, "events", {"action": action, "week_start": week_start, "delivery_card_id": card["id"], "card_name": card.get("name"), "actor": actor["name"], "note": note})


async def _next_version(conn: AsyncConnection, card_id: str) -> int:
    row = (await conn.execute(text("SELECT COALESCE(MAX(version), 0) FROM production_requests WHERE delivery_card_id = :c"), {"c": sc.coerce("uuid", card_id)})).first()
    return int(row[0] or 0) + 1 if row else 1


async def stale_live(conn: AsyncConnection, card_id: str) -> None:
    """生きている版(依頼済み・制作している・終わった)を、古い版にする。配信のしくみに送った版は、記録として残す"""
    await conn.execute(
        text("UPDATE production_requests SET status = 'stale', modified_on = now() WHERE delivery_card_id = :c AND status IN ('requested', 'in_progress', 'done')"),
        {"c": sc.coerce("uuid", card_id)},
    )


def _fields(body: dict[str, Any]) -> dict[str, Any]:
    """画面が送る、写しと、依頼した時点の制作指示・担当・締め切り"""
    due = str(body.get("production_due") or "")[:10] or None
    return {
        "snapshot": str(body.get("snapshot") or ""),
        "instructions": str(body.get("instructions") or ""),
        "production_owner": str(body.get("production_owner") or "").strip() or None,
        "production_due": due,
        # 依頼・送信のときに、エディタの HTML(直していればそれ)も一緒に固める
        "html": str(body.get("html") or "") or None,
    }


async def _approved_card(conn: AsyncConnection, card_id: str) -> tuple[dict[str, Any] | None, str | None]:
    card = await _one(conn, "delivery_cards", card_id, lock=True)
    if card is None:
        return None, "配信カードが見つかりません"
    if card.get("status") not in APPROVED:
        return None, "承認されていない配信です(先に承認を受けてください)"
    return card, None


@router.post("/requests")
async def create_request(request: Request):
    body = await _body(request)
    card_id = str(body.get("delivery_card_id") or "")
    week_start = body.get("week_start") or None
    if not body.get("snapshot"):
        return fail(400, "写し(snapshot)が要ります")
    async with db(write=True) as conn:
        actor = await _actor(conn, body, request)
        card, err = await _approved_card(conn, card_id)
        if card is None:
            return fail(400, err or "")
        await stale_live(conn, card_id)
        version = await _next_version(conn, card_id)
        row = await _insert(
            conn,
            "production_requests",
            {**_fields(body), "delivery_card_id": card_id, "version": version, "status": "requested", "requested_at": _now(), "requested_by_name": actor["name"]},
        )
        owner = row.get("production_owner")
        await _event(conn, "production_request", actor, card, week_start, f"版 {version}" + (f"・担当 {owner}" if owner else ""))
    return ok(row)


async def _advance(request: Request, request_id: str, allowed: tuple[str, ...], fields: dict[str, Any], action: str, note: str | None, refuse: str):
    """状態を進める(受け取った・終わった)。"@now" と "@actor" は、その時刻と操作した人の名前に置き換える"""
    body = await _body(request)
    week_start = body.get("week_start") or None
    async with db(write=True) as conn:
        actor = await _actor(conn, body, request)
        req = await _one(conn, "production_requests", request_id, lock=True)
        if req is None:
            return fail(404, "制作の依頼が見つかりません")
        if req.get("status") not in allowed:
            return fail(409, refuse)
        now = _now()
        stamped = {k: (now if v == "@now" else actor["name"] if v == "@actor" else v) for k, v in fields.items()}
        row = await _update(conn, "production_requests", request_id, stamped) or req
        card = await _one(conn, "delivery_cards", str(req["delivery_card_id"]))
        if card is not None:
            await _event(conn, action, actor, card, week_start, note)
    return ok(row)


@router.post("/requests/{request_id}/receive")
async def receive(request_id: str, request: Request):
    return await _advance(
        request,
        request_id,
        ("requested",),
        {"status": "in_progress", "received_at": "@now", "received_by_name": "@actor"},
        "production_receive",
        None,
        "この依頼は、もう受け取られているか、古い版です",
    )


@router.post("/requests/{request_id}/done")
async def done(request_id: str, request: Request):
    body = await _body(request)
    note = (str(body.get("note") or "")).strip() or None
    link = (str(body.get("link") or "")).strip() or None
    return await _advance(
        request,
        request_id,
        ("requested", "in_progress"),
        {"status": "done", "done_at": "@now", "done_by_name": "@actor", "done_note": note, "done_link": link},
        "production_done",
        " / ".join(x for x in (note, link) if x) or None,
        "この依頼は、もう終わっているか、古い版です",
    )


@router.post("/requests/{request_id}/html")
async def save_html(request_id: str, request: Request):
    """制作のページで直した HTML を保存する(版ごとに 1 つ。主に制作の人、企画の人も直せる)。古い版には保存しない"""
    body = await _body(request)
    html = str(body.get("html") or "")
    async with db(write=True) as conn:
        actor = await _actor(conn, body, request)
        req = await _one(conn, "production_requests", request_id, lock=True)
        if req is None:
            return fail(404, "制作の依頼が見つかりません")
        if req.get("status") == "stale":
            return fail(409, "古い版には保存できません(企画が変わりました)")
        row = await _update(conn, "production_requests", request_id, {"html": html, "html_saved_at": _now(), "html_saved_by_name": actor["name"]}) or req
    return ok(row)


@router.post("/requests/{request_id}/edits")
async def save_edits(request_id: str, request: Request):
    """制作のページの左で直した中身を保存する(2026-10-19、利用者と決めた: 承認のあとの文言・画像・商品・リンク先の調整は、
    企画と制作のあいだで決めてよく、承認のやり直しは要らない)。承認された snapshot と配信カードは書き換えず、別の列に持つ。
    空の文字を送ると、直したものを捨てて、承認された写しに戻す"""
    body = await _body(request)
    edited = str(body.get("edited_snapshot") or "") or None
    async with db(write=True) as conn:
        actor = await _actor(conn, body, request)
        req = await _one(conn, "production_requests", request_id, lock=True)
        if req is None:
            return fail(404, "制作の依頼が見つかりません")
        if req.get("status") == "stale":
            return fail(409, "古い版には保存できません(企画が変わりました)")
        row = await _update(conn, "production_requests", request_id, {"edited_snapshot": edited, "edited_at": _now(), "edited_by_name": actor["name"]}) or req
        card = await _one(conn, "delivery_cards", str(req["delivery_card_id"]))
        if card is not None:
            await _event(conn, "production_edit", actor, card, body.get("week_start") or None, f"版 {req.get('version')}" + ("" if edited else "(承認された写しに戻した)"))
    return ok(row)


@router.post("/requests/{request_id}/send")
async def send_request(request_id: str, request: Request):
    """制作が終わった版を、配信のしくみに送る(工程の最後。2026-10-19、利用者と決めた: 送るのは最後の最後なので、制作が終わってから)。
    新しい版は作らず、この版を「送った」にする。HTML は、いまのエディタのもの。送り先は、まだ仮(実際には送らない)"""
    body = await _body(request)
    html = str(body.get("html") or "") or None
    fields: dict[str, Any] = {"status": "sent", "sent_at": "@now", "sent_by_name": "@actor"}
    if html:
        fields["html"] = html
    res = await _advance(request, request_id, ("done",), fields, "production_send", "配信のしくみへの送信は、まだ仮", "制作が終わった版だけを送れます(まだ終わっていないか、古い版です)")
    return res


@router.post("/send")
async def send(request: Request):
    """制作を通さず、配信のしくみに送る。いまは送り先の窓口だけで、実際には送らない(配信のしくみの API が決まったら、ここで呼ぶ。HTML は body["html"])"""
    body = await _body(request)
    card_id = str(body.get("delivery_card_id") or "")
    week_start = body.get("week_start") or None
    if not body.get("snapshot"):
        return fail(400, "写し(snapshot)が要ります")
    async with db(write=True) as conn:
        actor = await _actor(conn, body, request)
        card, err = await _approved_card(conn, card_id)
        if card is None:
            return fail(400, err or "")
        now = _now()
        await stale_live(conn, card_id)
        version = await _next_version(conn, card_id)
        row = await _insert(
            conn,
            "production_requests",
            {
                **_fields(body),
                "delivery_card_id": card_id,
                "version": version,
                "status": "sent",
                "requested_at": now,
                "requested_by_name": actor["name"],
                "sent_at": now,
                "sent_by_name": actor["name"],
            },
        )
        await _event(conn, "production_send", actor, card, week_start, f"版 {version}(配信のしくみへの送信は、まだ仮)")
    return ok({**row, "message": "送りました"})
