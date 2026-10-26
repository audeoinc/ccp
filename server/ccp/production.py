"""制作の依頼(バックログ PR2・PR5。設計は docs/PRODUCTION.md)。

  POST /api/production/requests               「この内容で制作に依頼する」(画面が作った写しを固めて保存する)
  POST /api/production/requests/{id}/receive  制作が「受け取った」
  POST /api/production/requests/{id}/done     制作が「制作が終わった」(ひとこと・できたもののリンクを任意で)
  POST /api/production/requests/{id}/html     直した HTML を保存する(variant = "B" / "C" なら、AB テストのその案の HTML)
  POST /api/production/requests/{id}/edits    左の要素(文言・メイン画像・商品・リンク先)を直した写しを保存する
  POST /api/production/requests/{id}/check    企画が仕上がりを確かめて OK にする(PR7)
  POST /api/production/requests/{id}/revise   企画が「直してほしい」と制作に戻す(PR7)
  POST /api/production/requests/{id}/undo     工程を 1 段戻す(やり直す)
  POST /api/production/requests/{id}/send     制作が終わった版を、配信のしくみに送る(工程の最後。いまは仮の窓口)
  POST /api/production/send                   制作を通さず、配信のしくみに送る(いまは送り先の窓口だけ。実際には送らずに「送りました」と返す)

写し(snapshot)は、画面が組み立てて送る(テンプレート・リンク先・計測用のパラメーターの決め方が、画面の側にあるため)。
サーバーは、配信が承認済みかを確かめ、版を数え、前の版を古くし、操作の履歴(events)を残す。
承認がやり直しになったら、approvals.py の /reset が、生きている版を古い版(stale)にする。
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from . import repo, schema as sc
from .data_api import Fail, db, fail, ok, read_body, require_db
from .identity import request_actor

router = APIRouter(prefix="/api/production", dependencies=[Depends(require_db)])

APPROVED = ("approved", "confirmed")
# 制作の依頼に、承認を要るとするか。いま(いろいろな場所で画面を見せている段階)は、承認の前でも依頼できる(利用者の判断 2026-10-21)。
# 実践で使い始めるときは True に戻すかもしれない。画面の src/productionGate.ts の REQUIRE_APPROVAL と、必ずそろえる
REQUIRE_APPROVAL = False


async def _event(conn: AsyncConnection, action: str, actor: dict[str, str], card: dict[str, Any], week_start: str | None, note: str | None) -> None:
    await repo.insert(conn, "events", {"action": action, "week_start": week_start, "delivery_card_id": card["id"], "card_name": card.get("name"), "actor": actor["name"], "note": note})


async def _next_version(conn: AsyncConnection, card_id: str) -> int:
    row = (await conn.execute(text("SELECT COALESCE(MAX(version), 0) FROM production_requests WHERE delivery_card_id = :c"), {"c": sc.coerce("uuid", card_id)})).first()
    return int(row[0] or 0) + 1 if row else 1


async def stale_live(conn: AsyncConnection, card_id: str) -> None:
    """生きている版(依頼済み・制作している・終わった・確認した)を、古い版にする。配信のしくみに送った版は、記録として残す"""
    await conn.execute(
        text("UPDATE production_requests SET status = 'stale', modified_on = now() WHERE delivery_card_id = :c AND status IN ('requested', 'in_progress', 'done', 'checked')"),
        {"c": sc.coerce("uuid", card_id)},
    )


async def clear_card(conn: AsyncConnection, card_id: str) -> int:
    """カードの制作の依頼の行を、すべて消す(作り直したカード。X79 の段 ⑤)。消した行の数"""
    res = await conn.execute(text("DELETE FROM production_requests WHERE delivery_card_id = :c"), {"c": sc.coerce("uuid", card_id)})
    return int(res.rowcount or 0)


VARIANTS = ("B", "C")


def parse_variant_html(raw: Any) -> dict[str, dict[str, Any]]:
    """AB テストの B・C 案の HTML(列 variant_html。{"B": {"html", "saved_at", "saved_by_name"}, ...} の JSON)を読む。壊れていれば空"""
    try:
        data = json.loads(raw) if isinstance(raw, str) and raw else (raw or {})
    except ValueError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if k in VARIANTS and isinstance(v, dict) and isinstance(v.get("html"), str)}


def merge_variant_html(raw: Any, key: str, html: str, saved_at: str | None, by: str | None) -> str:
    """B・C 案の HTML を 1 つ差し替えた JSON を返す(ほかの案はそのまま)"""
    data = parse_variant_html(raw)
    data[key] = {"html": html, "saved_at": saved_at, "saved_by_name": by}
    return json.dumps(data, ensure_ascii=False)


def _variant_html_in(body: dict[str, Any]) -> str | None:
    """依頼・送信のときに画面が送る、B・C 案の HTML(なければ None)"""
    data = parse_variant_html(body.get("variant_html"))
    return json.dumps(data, ensure_ascii=False) if data else None


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
        # AB テスト(全案を送る)の B・C 案の HTML。A 案は html
        "variant_html": _variant_html_in(body),
    }


async def _approved_card(conn: AsyncConnection, card_id: str) -> tuple[dict[str, Any] | None, str | None]:
    card = await repo.one(conn, "delivery_cards", card_id, lock=True)
    if card is None:
        return None, "配信カードが見つかりません"
    if REQUIRE_APPROVAL and card.get("status") not in APPROVED:
        return None, "承認されていない配信です(先に承認を受けてください)"
    return card, None


@router.post("/requests")
async def create_request(request: Request):
    body = await read_body(request)
    card_id = str(body.get("delivery_card_id") or "")
    week_start = body.get("week_start") or None
    if not body.get("snapshot"):
        return fail(400, "写し(snapshot)が要ります")
    async with db(write=True) as conn:
        actor = await request_actor(conn, body, request)
        card, err = await _approved_card(conn, card_id)
        if card is None:
            raise Fail(400, err or "")
        await stale_live(conn, card_id)
        version = await _next_version(conn, card_id)
        row = await repo.insert(
            conn,
            "production_requests",
            {**_fields(body), "delivery_card_id": card_id, "version": version, "status": "requested", "requested_at": repo.now(), "requested_by_name": actor["name"]},
        )
        owner = row.get("production_owner")
        await _event(conn, "production_request", actor, card, week_start, f"版 {version}" + (f"・担当 {owner}" if owner else ""))
    return ok(row)


async def _advance(request: Request, request_id: str, allowed: tuple[str, ...], fields: dict[str, Any], action: str, note: str | None, refuse: str):
    """状態を進める(受け取った・終わった)。"@now" と "@actor" は、その時刻と操作した人の名前に置き換える"""
    body = await read_body(request)
    week_start = body.get("week_start") or None
    async with db(write=True) as conn:
        actor = await request_actor(conn, body, request)
        req = await repo.one(conn, "production_requests", request_id, lock=True)
        if req is None:
            raise Fail(404, "制作の依頼が見つかりません")
        if req.get("status") not in allowed:
            raise Fail(409, refuse)
        now = repo.now()
        stamped = {k: (now if v == "@now" else actor["name"] if v == "@actor" else v) for k, v in fields.items()}
        row = await repo.update(conn, "production_requests", request_id, stamped) or req
        card = await repo.one(conn, "delivery_cards", str(req["delivery_card_id"]))
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
    body = await read_body(request)
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
    body = await read_body(request)
    html = str(body.get("html") or "")
    variant = str(body.get("variant") or "A").upper()
    if variant not in ("A", *VARIANTS):
        return fail(400, "案は A・B・C のどれかです")
    async with db(write=True) as conn:
        actor = await request_actor(conn, body, request)
        req = await repo.one(conn, "production_requests", request_id, lock=True)
        if req is None:
            raise Fail(404, "制作の依頼が見つかりません")
        if req.get("status") == "stale":
            raise Fail(409, "古い版には保存できません(企画が変わりました)")
        now = repo.now()
        if variant == "A":
            fields: dict[str, Any] = {"html": html, "html_saved_at": now, "html_saved_by_name": actor["name"]}
        else:
            fields = {"variant_html": merge_variant_html(req.get("variant_html"), variant, html, now.isoformat(), actor["name"])}
        row = await repo.update(conn, "production_requests", request_id, fields) or req
    return ok(row)


@router.post("/requests/{request_id}/edits")
async def save_edits(request_id: str, request: Request):
    """制作のページの左で直した中身を保存する(2026-10-19、利用者と決めた: 承認のあとの文言・画像・商品・リンク先の調整は、
    企画と制作のあいだで決めてよく、承認のやり直しは要らない)。承認された snapshot と配信カードは書き換えず、別の列に持つ。
    空の文字を送ると、直したものを捨てて、承認された写しに戻す"""
    body = await read_body(request)
    edited = str(body.get("edited_snapshot") or "") or None
    async with db(write=True) as conn:
        actor = await request_actor(conn, body, request)
        req = await repo.one(conn, "production_requests", request_id, lock=True)
        if req is None:
            raise Fail(404, "制作の依頼が見つかりません")
        if req.get("status") == "stale":
            raise Fail(409, "古い版には保存できません(企画が変わりました)")
        row = await repo.update(conn, "production_requests", request_id, {"edited_snapshot": edited, "edited_at": repo.now(), "edited_by_name": actor["name"]}) or req
        card = await repo.one(conn, "delivery_cards", str(req["delivery_card_id"]))
        if card is not None:
            await _event(conn, "production_edit", actor, card, body.get("week_start") or None, f"版 {req.get('version')}" + ("" if edited else "(承認された写しに戻した)"))
    return ok(row)


# 工程を 1 段戻すときの、いまの状態 → (戻した先の状態, 消す記録)。依頼の取り下げ(requested → withdrawn)は、版を残して記録にする
_UNDO: dict[str, tuple[str, tuple[str, ...]]] = {
    "sent": ("checked", ("sent_at", "sent_by_name")),
    "checked": ("done", ("checked_at", "checked_by_name")),
    "done": ("in_progress", ("done_at", "done_by_name", "done_note", "done_link")),
    "in_progress": ("requested", ("received_at", "received_by_name")),
    "requested": ("withdrawn", ()),
}


@router.post("/requests/{request_id}/undo")
async def undo(request_id: str, request: Request):
    """工程を 1 段戻す(2026-10-19、利用者の要望: 押し間違い・やり直しのとき)。いちばん新しく終わった段だけを戻す。
    制作を通さずに送った版(受け取り・終わりの記録がない)は、取り下げにする(① からやり直す)"""
    body = await read_body(request)
    async with db(write=True) as conn:
        actor = await request_actor(conn, body, request)
        req = await repo.one(conn, "production_requests", request_id, lock=True)
        if req is None:
            raise Fail(404, "制作の依頼が見つかりません")
        status = str(req.get("status") or "")
        if status not in _UNDO:
            raise Fail(409, "この版は戻せません(古い版か、取り下げた版です)")
        to, clear = _UNDO[status]
        if status == "sent" and not req.get("checked_at"):
            # 仕上がりの確認より前に送った版(確認を作る前の記録)は、終わったに戻す。制作を通さずに送った版は、取り下げ
            to, clear = ("done", ("sent_at", "sent_by_name")) if req.get("done_at") else ("withdrawn", ())
        row = await repo.update(conn, "production_requests", request_id, {"status": to, **{k: None for k in clear}}) or req
        card = await repo.one(conn, "delivery_cards", str(req["delivery_card_id"]))
        if card is not None:
            await _event(conn, "production_undo", actor, card, body.get("week_start") or None, f"版 {req.get('version')}: {status} → {to}")
    return ok(row)


@router.post("/requests/{request_id}/check")
async def check(request_id: str, request: Request):
    """企画が仕上がりを確かめて「これで OK」にする(PR7)。このあと、配信のしくみに送れる"""
    return await _advance(request, request_id, ("done",), {"status": "checked", "checked_at": "@now", "checked_by_name": "@actor"}, "production_check", None, "制作が終わった版だけを確認できます")


@router.post("/requests/{request_id}/revise")
async def revise(request_id: str, request: Request):
    """企画が「直してほしい」と制作に戻す(PR7)。版は変えず、制作している に戻し、終わった の記録を消して、直してほしいことを残す"""
    body = await read_body(request)
    note = (str(body.get("note") or "")).strip()
    if not note:
        return fail(400, "直してほしいことを書いてください")
    return await _advance(
        request,
        request_id,
        ("done", "checked"),
        {
            "status": "in_progress",
            "done_at": None,
            "done_by_name": None,
            "checked_at": None,
            "checked_by_name": None,
            "revision_note": note,
            "revision_at": "@now",
            "revision_by_name": "@actor",
        },
        "production_revise",
        note,
        "制作が終わった版だけを、直してもらえます",
    )


@router.post("/requests/{request_id}/send")
async def send_request(request_id: str, request: Request):
    """仕上がりを確認した版を、配信のしくみに送る(工程の最後。2026-10-19、利用者と決めた: 送るのは最後の最後なので、確認が済んでから)。
    新しい版は作らず、この版を「送った」にする。HTML は、いまのエディタのもの。送り先は、まだ仮(実際には送らない)"""
    body = await read_body(request)
    html = str(body.get("html") or "") or None
    fields: dict[str, Any] = {"status": "sent", "sent_at": "@now", "sent_by_name": "@actor"}
    if html:
        fields["html"] = html
    # AB テストの B・C 案の HTML も、いまのエディタのもので送る
    variant_html = _variant_html_in(body)
    if variant_html:
        fields["variant_html"] = variant_html
    res = await _advance(request, request_id, ("checked",), fields, "production_send", "配信のしくみへの送信は、まだ仮", "仕上がりを確認した版だけを送れます(まだ確認していないか、古い版です)")
    return res


@router.post("/send")
async def send(request: Request):
    """制作を通さず、配信のしくみに送る。いまは送り先の窓口だけで、実際には送らない(配信のしくみの API が決まったら、ここで呼ぶ。HTML は body["html"])"""
    body = await read_body(request)
    card_id = str(body.get("delivery_card_id") or "")
    week_start = body.get("week_start") or None
    if not body.get("snapshot"):
        return fail(400, "写し(snapshot)が要ります")
    async with db(write=True) as conn:
        actor = await request_actor(conn, body, request)
        card, err = await _approved_card(conn, card_id)
        if card is None:
            raise Fail(400, err or "")
        now = repo.now()
        await stale_live(conn, card_id)
        version = await _next_version(conn, card_id)
        row = await repo.insert(
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
