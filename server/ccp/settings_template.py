"""設定の型(settings.setup): 1 つのサーバーの仕事の設定を書き出して、ほかのサーバーに写す。

入れるもの: AI の設定(ai)・BigQuery の表の場所(bq)・定期の取り込みの間隔(bq.sync)。
入れないもの: 秘密(パスワード・鍵)と DB のつなぎ先。AI の出口の URL に、合言葉を含められる所(?code=… など)があれば、
その URL も入れず、読み込んだ先で入れ直してもらう(dropped)。

ほかのリージョンの表を取り込んでしまわないように、読み込んだら BigQuery を「確認待ち」にする:
定期の取り込みは切にし、確認(POST /confirm。実際に読んで、NG がないこと)が通るまで、取り込まない(bq_import.sync)。
確認待ちは、⚙ の「設定の状態」と「データの取り込み」に出るので、忘れていても気づける。
"""
from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import unquote, urlsplit

from fastapi import APIRouter, Request

from . import appsettings, health

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings/template")

KIND = "ccp-settings-template"
VERSION = 1


def _carries_secret(url: str) -> bool:
    parts = urlsplit(url)
    return bool(parts.username or parts.password or parts.query or parts.fragment)


def build() -> dict[str, Any]:
    from .bq_import import SETTINGS_NAME, parse_settings

    ai = appsettings.current("ai")
    dropped = []
    if ai.get("outlet_url") and _carries_secret(str(ai["outlet_url"])):
        ai["outlet_url"] = ""
        dropped.append("ai.outlet_url")
    return {
        "kind": KIND,
        "version": VERSION,
        "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dropped": dropped,
        "groups": {"ai": ai, "bq": appsettings.current("bq"), SETTINGS_NAME: parse_settings(appsettings.raw(SETTINGS_NAME))},
    }


async def apply(template: Any, by: str) -> dict[str, Any]:
    """型を読み込む。だめなら appsettings.Invalid(何も変えない)。先にすべて確かめてから書く"""
    from .bq_import import SETTINGS_NAME, parse_settings

    if not isinstance(template, dict) or template.get("kind") != KIND:
        raise appsettings.Invalid("設定の型のファイルではありません")
    if template.get("version") != VERSION:
        raise appsettings.Invalid(f"この版では読めない設定の型です(版 {template.get('version')})")
    groups = template.get("groups")
    if not isinstance(groups, dict):
        raise appsettings.Invalid("設定の型の中身が足りません")
    await appsettings.ensure()
    dropped = [str(x) for x in template.get("dropped") or []]
    # 入っていない項目は、このサーバーのいまの値のまま(型に入れなかった AI の出口を、空で消さないように)
    given_ai = dict(groups.get("ai") or {})
    if "ai.outlet_url" in dropped:
        given_ai.pop("outlet_url", None)
    ai = appsettings.clean("ai", {**appsettings.current("ai"), **given_ai})
    bq_values = appsettings.clean("bq", {**appsettings.current("bq"), **(groups.get("bq") or {})})
    # 間隔は写すが、入・切は写さない(確認が通るまで、勝手に取り込み始めないように)
    sync = {**parse_settings(groups.get(SETTINGS_NAME)), "enabled": False}

    await appsettings.save("ai", ai, by, ["設定の型"])
    await appsettings.save("bq", bq_values, by, ["設定の型"])
    await appsettings.save(SETTINGS_NAME, sync, by, ["設定の型"])
    has_locations = any(v for k, v in bq_values.items() if k != "project")
    if has_locations:
        await appsettings.save(appsettings.PENDING, {"exportedAt": str(template.get("exportedAt") or "")}, by, ["設定の型"])
    health.forget_summary()
    log.info("設定の型を読み込みました(確認待ち: %s)", has_locations)
    return {"dropped": dropped, "pending": has_locations}


def _actor(request: Request) -> str:
    return unquote(request.headers.get("x-ccp-actor", "")).strip()[:100]


@router.get("")
async def export_template(request: Request) -> dict[str, Any]:
    if bad := await health.denied(request):
        return bad
    await appsettings.ensure()
    return {"success": True, "data": build()}


@router.post("")
async def import_template(request: Request) -> dict[str, Any]:
    if bad := await health.denied(request):
        return bad
    try:
        return {"success": True, "data": await apply((await request.json()) or {}, _actor(request))}
    except appsettings.Invalid as e:
        return {"success": False, "error": {"message": str(e), "code": "bad_template"}}


@router.post("/confirm")
async def confirm(request: Request) -> dict[str, Any]:
    """いまの表の場所を実際に読んで、NG がなければ確認待ちを解く(ここで初めて取り込めるようになる)"""
    if bad := await health.denied(request):
        return bad
    from .bq_import import _bq_error, check

    await appsettings.ensure()
    try:
        result = await check()
    except Exception as e:  # noqa: BLE001 — つながらない理由を、画面にそのまま出す
        return _bq_error(e, "確認")
    bad_outputs = [o for o in result.get("outputs", []) if not o.get("ok")]
    if bad_outputs:
        names = "、".join(str(o.get("label")) for o in bad_outputs)
        return {"success": False, "error": {"message": f"確認が通りませんでした({names})。行を開いて、表の場所と理由を見てください", "code": "check_failed"}}
    await appsettings.save(appsettings.PENDING, {}, _actor(request), ["確認"])
    health.forget_summary()
    return {"success": True, "data": {"pending": False}}
