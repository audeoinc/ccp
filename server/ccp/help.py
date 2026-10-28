"""「？ 聞く」の質問の保存と、よく聞かれる質問(FAQ)のまとめ直し(X82 段 ④)。

  POST /api/help/questions             質問と答えを 1 つ足す(だれが聞いたかは受け取らない)。tellDev なら「開発に伝える」に進んだ印を付ける。
                                       まだまとめていない数(pending)を返し、THRESHOLD 以上なら、画面がまとめ直しを始める
  GET  /api/help/faqs                  よく聞かれる質問(隠したものは除く。回数の多い順)。?all=1 で隠したものも、まとめ直しの様子も
  POST /api/help/faqs/{id}/hidden      まちがった FAQ を隠す・戻す {hidden: bool}
  GET  /api/help/questions             生の記録(新しい順。開発の画面で見る)
  POST /api/help/builds                まとめ直しの札を取り、まとめる材料(まだまとめていない質問と、いまの FAQ)を返す
  POST /api/help/builds/{id}/finish    AI が束ねた結果を入れる(FAQ を足す・直す、回数を足す、質問にまとめた印を付ける)
  POST /api/help/builds/{id}/fail      まとめ直しの失敗を残して、札を返す

AI を呼ぶのは画面(src/help/faq.ts の askAgent)で、ここは呼ばない。AI の呼び出しを askAgent の 1 か所にそろえ、
FAQ の答えも「？ 聞く」と同じ材料・同じ指示で作るため(材料と指示は画面の側にある)。ここは札・保存・数え上げだけ。
生の記録は、まとめに入れてから RETAIN_DAYS 日で消す(purge)。定期の仕組みは持たないので、質問の保存・まとめ直しの終わり・
FAQ の一覧を開いたときに、毎回消す(2026-10-28 利用者と決めた)。
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from . import schema as sc
from .data_api import Fail, db, ok, read_body, require_db

router = APIRouter(prefix="/api/help", dependencies=[Depends(require_db)])

# 前にまとめてから、新しい質問がこの数たまったら、まとめ直す(利用者 2026-10-26「例えば質問 20 回ごと」)
THRESHOLD = 20
# 生の記録を、まとめに入れてから残す日数
RETAIN_DAYS = 90
# まとめ直しの札が切れるまでの分(画面を閉じるなどで終わらなかったとき、次の人が取り直せるように)
LEASE_MINUTES = 10
# 1 回のまとめ直しで渡す質問の数の上限(AI に渡す文が大きくなりすぎないように。残りは次の回)
BATCH = 200
# 大きさの上限(壊れた画面からの大量の書き込みで、表がふくらまないように)
MAX_QUESTION = 4_000
MAX_ANSWER = 40_000
MAX_PLACES = 12


def _text(v: Any, limit: int) -> str:
    if v is None:
        return ""
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return s[:limit]


def check_record(body: Any) -> tuple[dict[str, Any] | None, str | None]:
    """POST /questions の中身(src/help/helpAsk.ts の HelpRecord)を確かめて、列の値にする。だめなら (None, 理由)"""
    if not isinstance(body, dict):
        return None, "中身がありません"
    question = body.get("question")
    if not isinstance(question, str) or not question.strip():
        return None, "質問がありません"
    lang = body.get("lang")
    part = body.get("part") if isinstance(body.get("part"), dict) else {}
    return {
        "question": question.strip()[:MAX_QUESTION],
        "answer": _text(body.get("answer"), MAX_ANSWER),
        "lang": lang if lang in ("ja", "en") else "ja",
        "screen": _text(body.get("screen") if isinstance(body.get("screen"), dict) else None, 1_000),
        "element": _text(part.get("el"), 200) or None,
        "element_label": _text(part.get("label"), 200) or None,
        "asked_at": body.get("at") if isinstance(body.get("at"), str) else None,
        "tell_dev": body.get("tellDev") is True,
    }, None


def place_key(screen: str | None, element: str | None) -> dict[str, str]:
    """質問の画面(HelpRecord.screen の JSON)と部品から、関係する場所の 1 つ"""
    out: dict[str, str] = {}
    try:
        s = json.loads(screen) if screen else {}
    except ValueError:
        s = {}
    for k in ("page", "view", "open"):
        if isinstance(s, dict) and isinstance(s.get(k), str) and s[k]:
            out[k] = s[k]
    if element:
        out["el"] = element
    return out


def merge_places(old: str | None, new: list[dict[str, str]]) -> str:
    """FAQ の関係する場所に、新しい質問の場所を足す(同じ場所は数を足す。多い順に MAX_PLACES まで)"""
    try:
        rows = json.loads(old) if old else []
    except ValueError:
        rows = []
    counts: dict[str, dict[str, Any]] = {}
    for r in rows if isinstance(rows, list) else []:
        if isinstance(r, dict):
            key = json.dumps({k: v for k, v in r.items() if k != "count"}, sort_keys=True)
            counts[key] = {**r, "count": int(r.get("count") or 1)}
    for p in new:
        if not p:
            continue
        key = json.dumps(p, sort_keys=True)
        counts[key] = {**p, "count": counts.get(key, {}).get("count", 0) + 1}
    top = sorted(counts.values(), key=lambda r: -r["count"])[:MAX_PLACES]
    return json.dumps(top, ensure_ascii=False)


async def purge(conn: AsyncConnection) -> int:
    """まとめに入れてから RETAIN_DAYS 日を過ぎた生の記録を消す(まとめに入れていない記録は消さない)"""
    res = await conn.execute(text("DELETE FROM help_questions WHERE summarized_at < now() - make_interval(days => :d)"), {"d": RETAIN_DAYS})
    return res.rowcount or 0


async def pending_count(conn: AsyncConnection) -> int:
    return int((await conn.execute(text("SELECT count(*) FROM help_questions WHERE summarized_at IS NULL"))).scalar() or 0)


@router.post("/questions")
async def add_question(request: Request):
    rec, err = check_record(await read_body(request))
    if rec is None:
        raise Fail(400, err or "")
    async with db(write=True) as conn:
        asked = sc.coerce("timestamptz", rec["asked_at"]) if rec["asked_at"] else None
        done = False
        if rec["tell_dev"]:
            # 「開発に伝える」に進んだ: 同じ質問の記録に印を付ける(別の行にすると、聞かれた回数を 2 回に数えてしまう)。もうまとめた質問なら、FAQ の数にも足す。
            # 同じ記録は、質問の文と答えが同じもので見る(もう一度渡されるときの at は押した時刻で、聞いた時刻と違うため。ask-interface.md)。印のまだない新しい行から
            row = (
                await conn.execute(
                    text(
                        "SELECT id, sent_to_dev_at, help_faq_id FROM help_questions WHERE question = :q AND answer = :ans "
                        "ORDER BY (sent_to_dev_at IS NULL) DESC, created_on DESC LIMIT 1"
                    ),
                    {"q": rec["question"], "ans": rec["answer"]},
                )
            ).mappings().first()
            if row is not None:
                done = True
                if row["sent_to_dev_at"] is None:
                    await conn.execute(text("UPDATE help_questions SET sent_to_dev_at = now(), modified_on = now() WHERE id = :id"), {"id": row["id"]})
                    if row["help_faq_id"] is not None:
                        await conn.execute(text("UPDATE help_faqs SET dev_count = coalesce(dev_count, 0) + 1, modified_on = now() WHERE id = :id"), {"id": row["help_faq_id"]})
        if not done:
            await conn.execute(
                text(
                    "INSERT INTO help_questions (question, answer, lang, screen, element, element_label, asked_at, sent_to_dev_at) "
                    "VALUES (:question, :answer, :lang, :screen, :element, :element_label, :asked_at, CASE WHEN :tell THEN now() END)"
                ),
                {**{k: rec[k] for k in ("question", "answer", "lang", "screen", "element", "element_label")}, "asked_at": asked, "tell": rec["tell_dev"]},
            )
        await purge(conn)
        pending = await pending_count(conn)
    return ok({"pending": pending, "threshold": THRESHOLD})


def _faq_row(r: Any) -> dict[str, Any]:
    out = {k: sc.serialize(v) for k, v in dict(r).items()}
    return out


@router.get("/faqs")
async def list_faqs(all: int = 0):
    async with db(write=True) as conn:
        # 開発の画面で開いたときにも、古い生の記録を消す(質問がしばらくないときのため)
        if all:
            await purge(conn)
        where = "" if all else "WHERE hidden_at IS NULL"
        rows = (
            await conn.execute(
                text(
                    "SELECT id, question_ja, question_en, answer_ja, answer_en, ask_count, dev_count, first_asked_at, last_asked_at, places, hidden_at, built_at "
                    f"FROM help_faqs {where} ORDER BY coalesce(ask_count, 0) DESC, last_asked_at DESC NULLS LAST"
                )
            )
        ).mappings().all()
        extra: dict[str, Any] = {}
        if all:
            last = (await conn.execute(text("SELECT id, status, question_count, faq_count, error, created_on, finished_at FROM help_faq_builds ORDER BY created_on DESC LIMIT 5"))).mappings().all()
            total = int((await conn.execute(text("SELECT count(*) FROM help_questions"))).scalar() or 0)
            extra = {"pending": await pending_count(conn), "threshold": THRESHOLD, "questions": total, "retainDays": RETAIN_DAYS, "builds": [_faq_row(b) for b in last]}
    return ok({"faqs": [_faq_row(r) for r in rows], **extra})


@router.post("/faqs/{faq_id}/hidden")
async def set_hidden(faq_id: str, request: Request):
    body = await read_body(request)
    hidden = isinstance(body, dict) and body.get("hidden") is True
    async with db(write=True) as conn:
        res = await conn.execute(
            text("UPDATE help_faqs SET hidden_at = CASE WHEN :h THEN now() END, modified_on = now() WHERE id = :id"),
            {"h": hidden, "id": sc.coerce("uuid", faq_id)},
        )
        if not res.rowcount:
            raise Fail(404, "その質問は見つかりません")
    return ok({"hidden": hidden})


@router.get("/questions")
async def list_questions(limit: int = 200):
    async with db() as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT q.id, q.question, q.answer, q.lang, q.screen, q.element, q.element_label, coalesce(q.asked_at, q.created_on) AS asked_at, "
                    "q.sent_to_dev_at, q.summarized_at, q.help_faq_id FROM help_questions q ORDER BY q.created_on DESC LIMIT :n"
                ),
                {"n": max(1, min(limit, 1000))},
            )
        ).mappings().all()
    return ok([_faq_row(r) for r in rows])


@router.post("/builds")
async def start_build():
    async with db(write=True) as conn:
        # 札を取るのは 1 人ずつ(同時に押しても、2 つ走らないように)
        await conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('ccp.help_faq_builds'))"))
        await conn.execute(
            text("UPDATE help_faq_builds SET status = 'error', error = '時間切れ(画面が閉じられたなど)', finished_at = now() WHERE status = 'running' AND created_on < now() - make_interval(mins => :m)"),
            {"m": LEASE_MINUTES},
        )
        busy = (await conn.execute(text("SELECT id FROM help_faq_builds WHERE status = 'running' LIMIT 1"))).first()
        if busy is not None:
            raise Fail(409, "ほかの画面が、いままとめ直しています", "busy")
        questions = (
            await conn.execute(
                text(
                    "SELECT id, question, lang, screen, element, element_label, sent_to_dev_at IS NOT NULL AS sent_to_dev "
                    "FROM help_questions WHERE summarized_at IS NULL ORDER BY created_on LIMIT :n"
                ),
                {"n": BATCH},
            )
        ).mappings().all()
        if not questions:
            raise Fail(409, "まとめる質問がありません", "empty")
        faqs = (await conn.execute(text("SELECT id, question_ja, question_en, answer_ja, ask_count, hidden_at IS NOT NULL AS hidden FROM help_faqs ORDER BY coalesce(ask_count, 0) DESC"))).mappings().all()
        build_id = (await conn.execute(text("INSERT INTO help_faq_builds (status, question_count) VALUES ('running', :n) RETURNING id"), {"n": len(questions)})).scalar()
    return ok({"id": sc.serialize(build_id), "questions": [_faq_row(q) for q in questions], "faqs": [_faq_row(f) for f in faqs]})


def check_groups(body: Any, faq_ids: set[str], question_ids: set[str]) -> tuple[list[dict[str, Any]] | None, str | None]:
    """finish の中身を確かめる。束ねた質問は、札を取ったときに渡したものだけ(1 つの質問は 1 つの束にだけ)"""
    groups = body.get("groups") if isinstance(body, dict) else None
    if not isinstance(groups, list):
        return None, "groups がありません"
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for g in groups:
        if not isinstance(g, dict):
            continue
        ids: list[str] = []
        for i in g.get("question_ids") or []:
            if isinstance(i, str) and i in question_ids and i not in seen:
                seen.add(i)
                ids.append(i)
        faq_id = g.get("faq_id") if isinstance(g.get("faq_id"), str) and g.get("faq_id") in faq_ids else None
        texts = {k: _text(g.get(k), MAX_ANSWER if k.startswith("answer") else MAX_QUESTION) for k in ("question_ja", "question_en", "answer_ja", "answer_en")}
        # 新しい束は、聞き方と答えがそろっているものだけ(足りない束の質問は、まとめた印だけ付けて、FAQ にはしない)
        if faq_id is None and not (texts["question_ja"] and texts["answer_ja"]):
            ids_only = {"faq_id": None, "question_ids": ids, "texts": None}
            out.append(ids_only)
            continue
        out.append({"faq_id": faq_id, "question_ids": ids, "texts": texts if any(texts.values()) else None})
    return out, None


@router.post("/builds/{build_id}/finish")
async def finish_build(build_id: str, request: Request):
    body = await read_body(request)
    bid = sc.coerce("uuid", build_id)
    async with db(write=True) as conn:
        b = (await conn.execute(text("SELECT status FROM help_faq_builds WHERE id = :id FOR UPDATE"), {"id": bid})).first()
        if b is None or b[0] != "running":
            raise Fail(409, "このまとめ直しは、もう終わっているか、時間切れです", "not_running")
        qrows = (
            await conn.execute(
                text("SELECT id, screen, element, sent_to_dev_at, coalesce(asked_at, created_on) AS at FROM help_questions WHERE summarized_at IS NULL ORDER BY created_on LIMIT :n"),
                {"n": BATCH},
            )
        ).mappings().all()
        qmap = {str(q["id"]): q for q in qrows}
        faq_ids = {str(r[0]) for r in (await conn.execute(text("SELECT id FROM help_faqs"))).all()}
        groups, err = check_groups(body, faq_ids, set(qmap))
        if groups is None:
            raise Fail(400, err or "")
        touched = 0
        for g in groups:
            qs = [qmap[i] for i in g["question_ids"]]
            faq_id = g["faq_id"]
            if faq_id is None and g["texts"] is not None:
                faq_id = str((await conn.execute(text("INSERT INTO help_faqs (ask_count, dev_count) VALUES (0, 0) RETURNING id"))).scalar())
            if faq_id is not None:
                touched += 1
                cur = (await conn.execute(text("SELECT places FROM help_faqs WHERE id = :id"), {"id": sc.coerce("uuid", faq_id)})).first()
                ats = [q["at"] for q in qs if q["at"] is not None]
                params: dict[str, Any] = {
                    "id": sc.coerce("uuid", faq_id),
                    "n": len(qs),
                    "dev": sum(1 for q in qs if q["sent_to_dev_at"] is not None),
                    "places": merge_places(cur[0] if cur else None, [place_key(q["screen"], q["element"]) for q in qs]),
                }
                sets = [
                    "ask_count = coalesce(ask_count, 0) + :n",
                    "dev_count = coalesce(dev_count, 0) + :dev",
                    "places = :places",
                    "modified_on = now()",
                ]
                if ats:
                    params.update({"first": min(ats), "last": max(ats)})
                    sets += ["first_asked_at = least(coalesce(first_asked_at, :first), :first)", "last_asked_at = greatest(coalesce(last_asked_at, :last), :last)"]
                if g["texts"] is not None:
                    # 書き直した聞き方・答えだけを置き換える(空の項目は、前の文のまま)
                    for k, v in g["texts"].items():
                        if v:
                            sets.append(f"{k} = :{k}")
                            params[k] = v
                    sets.append("built_at = now()")
                await conn.execute(text(f"UPDATE help_faqs SET {', '.join(sets)} WHERE id = :id"), params)
            if qs:
                await conn.execute(
                    text("UPDATE help_questions SET summarized_at = now(), help_faq_id = :f, modified_on = now() WHERE id = ANY(:ids)"),
                    {"f": sc.coerce("uuid", faq_id) if faq_id else None, "ids": [q["id"] for q in qs]},
                )
        # どの束にも入らなかった質問(お礼・意味のない文など)も、まとめた印を付ける(次のまとめ直しで、何度も渡さないように)
        left = [q["id"] for i, q in qmap.items() if not any(i in g["question_ids"] for g in groups)]
        if left:
            await conn.execute(text("UPDATE help_questions SET summarized_at = now(), modified_on = now() WHERE id = ANY(:ids)"), {"ids": left})
        await purge(conn)
        await conn.execute(text("UPDATE help_faq_builds SET status = 'done', faq_count = :n, finished_at = now(), modified_on = now() WHERE id = :id"), {"n": touched, "id": bid})
        pending = await pending_count(conn)
    return ok({"faqs": touched, "pending": pending})


@router.post("/builds/{build_id}/fail")
async def fail_build(build_id: str, request: Request):
    body = await read_body(request)
    msg = _text(body.get("error") if isinstance(body, dict) else None, 1_000) or "失敗しました"
    async with db(write=True) as conn:
        await conn.execute(
            text("UPDATE help_faq_builds SET status = 'error', error = :e, finished_at = now(), modified_on = now() WHERE id = :id AND status = 'running'"),
            {"e": msg, "id": sc.coerce("uuid", build_id)},
        )
    return ok({})
