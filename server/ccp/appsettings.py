"""仕事の設定(BigQuery の出力の場所・AI のモデルなど)を、DB(表 app_settings)で持つ(settings.dataimport・settings.ai。2026-11-03 利用者)。

環境変数は、ファイルを書き換えて起動し直さないと変わらず、だれが変えたかも残らないので、管理の画面で変えられる DB に移した。
- 正は DB だけ。値を読むのは、この部品だけ(bq.py・ai.py などは get() を通す)。
- DB にまだそのまとまり(bq / ai)の行がなく、環境変数に値があれば、一度だけ DB に写す(source = env。画面に「環境変数から写しました」)。
  写したあとは、環境変数は読まない(残っていても、DB の値が効く)。
- 変えるたびに 1 行足す(最新の行が、いまの値。前の行は、だれ・いつ・どの項目を変えたかの記録)。
- 読んだ値は、このプロセスにしばらく覚えておき(TTL_S)、保存したら捨てる(起動し直さずに、次の呼び出しから効く)。
- DB を読めないあいだは、前に読んだ値を使い、一度も読めていなければ環境変数の値を使う(DB の起動中に AI や取り込みが止まらないように)。

起動に要る値(DATABASE_URL・ASSET_DIR・GOOGLE_CLOUD_PROJECT など)・秘密(パスワード・鍵)・止める切り替え(BQ_AUTO_SYNC)は、環境変数のまま。

  GET  /api/settings/{bq|ai}       いまの値・既定・写した記録・変えた記録(管理する人だけ)
  PUT  /api/settings/{bq|ai}       値を保存する(管理する人だけ)
  POST /api/settings/bq/try        保存の前に、入れた表の場所で「接続を確認」(読んで確かめるだけ。何も書かない)
"""
from __future__ import annotations

import contextvars
import json
import logging
import os
import re
import time
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, Request
from sqlalchemy import text

from . import dbready, schema as sc

log = logging.getLogger("ccp.appsettings")
router = APIRouter(prefix="/api/settings")

# 覚えておく時間(秒)。ほかのインスタンスで保存した値も、この時間のうちに効く
TTL_S = 300
# DB を読めなかったとき、次に読み直すまで(秒)。呼ぶたびに待たないように
RETRY_S = 30

THINKING = ("minimal", "low", "medium", "high")
# AI の設定: 項目 → (環境変数, 既定)
AI_FIELDS: dict[str, tuple[str, Any]] = {
    "model": ("GEMINI_MODEL", "gemini-3.5-flash"),
    "thinking": ("GEMINI_THINKING", "low"),
    "concurrency": ("GEMINI_CONCURRENCY", 4),
    "outlet_url": ("AI_OUTLET_URL", ""),
    "outlet_timeout": ("AI_OUTLET_TIMEOUT", 120),
}
GROUPS = ("bq", "ai")

# まとめ(name) → 最新の行 {value, by, at, source, changes}
_rows: dict[str, dict[str, Any]] = {}
_loaded_at: float | None = None
# DB を最後に読めたか(読めなければ、早めに読み直す)
_rows_ok = False
# 「接続を確認」で、保存の前の値を試すあいだだけ、上から重ねる値(まとめ → 項目 → 値)
_trial: contextvars.ContextVar[dict[str, dict[str, Any]] | None] = contextvars.ContextVar("ccp_settings_trial", default=None)


def bq_fields() -> dict[str, tuple[str, Any]]:
    """BigQuery の設定: 問い合わせのプロジェクトと、出力ごとの場所・更新を見る元の表(BQ_<名前>_WATCH)"""
    from .bq import OUTPUTS

    out: dict[str, tuple[str, Any]] = {"project": ("BQ_PROJECT", "")}
    for o in OUTPUTS:
        out[o.name] = (o.env, "")
        out[f"{o.name}_watch"] = (f"{o.env}_WATCH", "")
    return out


def fields(group: str) -> dict[str, tuple[str, Any]]:
    return bq_fields() if group == "bq" else AI_FIELDS


def _env_values(group: str) -> dict[str, Any]:
    """環境変数に入っている値(空は除く)"""
    out = {}
    for key, (env, _default) in fields(group).items():
        v = (os.getenv(env) or "").strip()
        if v:
            out[key] = v
    return out


def get(group: str, key: str) -> Any:
    """いまの値(試している値 → DB → DB にまだそのまとめがない・読めていなければ環境変数 → 既定)。型は既定にそろえる。
    DB にまとめの行があれば、項目が空でも環境変数は見ない(DB だけが正)"""
    env, default = fields(group)[key]
    trial = (_trial.get() or {}).get(group) or {}
    if key in trial:
        v = trial[key]
    elif group in _rows:
        v = _rows[group]["value"].get(key)
    else:
        v = os.getenv(env)
    return _coerce(v, default)


def _coerce(v: Any, default: Any) -> Any:
    if v is None or (isinstance(v, str) and not v.strip()):
        return default
    if isinstance(default, int):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return default
    return str(v).strip()


def raw(name: str) -> dict[str, Any] | None:
    """まとめの最新の行の値(bq / ai 以外のまとめ。例 bq.sync)。なければ None"""
    row = _rows.get(name)
    return dict(row["value"]) if row else None


class trying:
    """保存の前の値を、このあいだだけ試す(with の中の get() に効く。ほかの依頼には効かない)"""

    def __init__(self, group: str, values: dict[str, Any]):
        self.layer = {group: values}

    def __enter__(self) -> None:
        self.token = _trial.set(self.layer)

    def __exit__(self, *exc: Any) -> None:
        _trial.reset(self.token)


def forget() -> None:
    """覚えた値を捨てる(保存したあと。次の get の前の ensure で読み直す)"""
    global _loaded_at
    _loaded_at = None


async def _read(conn: Any) -> dict[str, dict[str, Any]]:
    rows = (await conn.execute(text(
        "SELECT DISTINCT ON (name) name, value, changed_by, source, changes, created_on FROM app_settings ORDER BY name, created_on DESC"
    ))).mappings().all()
    out = {}
    for r in rows:
        try:
            value = json.loads(r["value"] or "{}")
        except ValueError:
            value = {}
        out[r["name"]] = {"value": value if isinstance(value, dict) else {}, "by": r["changed_by"], "at": r["created_on"], "source": r["source"], "changes": r["changes"]}
    return out


async def _copy_env(conn: Any, have: dict[str, dict[str, Any]]) -> bool:
    """DB にまだない bq / ai のまとめを、環境変数から一度だけ写す。写したら True"""
    copied = False
    for group in GROUPS:
        if group in have:
            continue
        values = _env_values(group)
        if not values:
            continue
        envs = [fields(group)[k][0] for k in values]
        await conn.execute(text(
            "INSERT INTO app_settings (name, value, changed_by, source, changes) VALUES (:name, :value, :by, 'env', :changes)"
        ), {"name": group, "value": json.dumps(values, ensure_ascii=False), "by": "環境変数から", "changes": json.dumps(sorted(values))})
        log.info("設定 %s を、環境変数(%s)から DB に写しました。これからは DB の値を使います", group, ", ".join(envs))
        copied = True
    return copied


async def ensure(copy_env: bool = True) -> None:
    """覚えた値が古ければ、DB から読み直す。copy_env なら、まだ DB にないまとめを環境変数から写す(コマンドの確認では写さない)"""
    global _rows, _loaded_at, _rows_ok
    now = time.monotonic()
    if _loaded_at is not None and now - _loaded_at < (TTL_S if _rows_ok else RETRY_S):
        return
    from .data_api import db

    try:
        async with db(write=copy_env) as conn:
            got = await _read(conn)
            if copy_env and await _copy_env(conn, got):
                got = await _read(conn)
        _rows, _rows_ok = got, True
    except dbready.DbNotReady:
        _rows_ok = bool(_rows)
        log.info("DB の準備中のため、設定は前の値(なければ環境変数)を使います")
    except Exception as e:  # noqa: BLE001 — 表がまだない など。前の値(なければ環境変数)で動き続ける
        _rows_ok = bool(_rows)
        log.warning("設定を DB から読めません(前の値か環境変数を使います): %s", e)
    _loaded_at = now


async def load_from(conn: Any) -> None:
    """コマンド(ccp.cli check・bq-check)から、そのコマンドの接続で読む。写さない(何も変えない)。読めなければ例外(呼ぶ側は環境変数のまま進む)"""
    global _rows, _loaded_at, _rows_ok
    _rows, _rows_ok, _loaded_at = await _read(conn), True, time.monotonic()


async def ensure_cli() -> None:
    """コマンドから: DB を読めれば DB の値を使う。読めなければ環境変数"""
    from .db import get_engine

    try:
        engine = await get_engine()
        async with engine.connect() as conn:
            await load_from(conn)
        await engine.dispose()
    except Exception as e:  # noqa: BLE001
        log.info("設定を DB から読めません(環境変数を使います): %s", e)


def source(group: str) -> str:
    """値がどこから来ているか(db = DB の行 / env = DB にまだなく、環境変数か既定)"""
    return "db" if group in _rows else "env"


# ---- 値の確かめ

_LOCATION = re.compile(r"^[^\s`'\";]+$")
_PROJECT = re.compile(r"^[A-Za-z0-9_.:\-]*$")


class Invalid(ValueError):
    pass


def _or(v: Any, default: Any) -> Any:
    return default if v is None or (isinstance(v, str) and not v.strip()) else v


def clean(group: str, values: dict[str, Any]) -> dict[str, Any]:
    """画面から来た値をそろえる。だめなら Invalid(理由)。知らない項目は捨てる"""
    out: dict[str, Any] = {}
    if group == "bq":
        for key in bq_fields():
            v = str(values.get(key) or "").strip().strip("`").strip()
            if not v:
                out[key] = ""
            elif key == "project":
                if not _PROJECT.match(v):
                    raise Invalid(f"プロジェクトの形が正しくありません: {v}")
                out[key] = v
            else:
                if not _LOCATION.match(v) or v.count(".") < 2:
                    raise Invalid(f"表の場所は <プロジェクト>.<データセット>.<テーブルかビュー> の形で書いてください: {v}")
                out[key] = v
        return out
    model = str(values.get("model") or "").strip()
    if not model or len(model) > 100 or not re.match(r"^[A-Za-z0-9_.\-/@]+$", model):
        raise Invalid("モデルの名前を入れてください(例 gemini-3.5-flash)")
    thinking = str(values.get("thinking") or "low").strip().lower()
    if thinking not in THINKING:
        raise Invalid(f"考える深さは {' / '.join(THINKING)} のどれかです")
    try:
        # 0 も「入れた値」として確かめる(or で既定にすると、0 が通ってしまう)
        concurrency = int(_or(values.get("concurrency"), 4))
        timeout = int(_or(values.get("outlet_timeout"), 120))
    except (TypeError, ValueError) as e:
        raise Invalid("同時に呼ぶ数・待ち時間は、数で入れてください") from e
    if not 1 <= concurrency <= 32:
        raise Invalid("同時に呼ぶ数は 1〜32 です")
    if not 5 <= timeout <= 600:
        raise Invalid("待ち時間は 5〜600 秒です")
    url = str(values.get("outlet_url") or "").strip()
    if url and not re.match(r"^https?://\S+$", url):
        raise Invalid("AI の出口は http:// か https:// で始まる URL です(使わないなら空)")
    return {"model": model, "thinking": thinking, "concurrency": concurrency, "outlet_url": url, "outlet_timeout": timeout}


def current(group: str) -> dict[str, Any]:
    """画面に出す、いまの値(既定で埋める)"""
    return {k: get(group, k) for k in fields(group)}


async def save(name: str, value: dict[str, Any], by: str, changes: list[str]) -> None:
    """1 行足す(最新の行が、いまの値)。保存したら、覚えた値を捨てる"""
    from .data_api import db

    async with db(write=True) as conn:
        await conn.execute(text(
            "INSERT INTO app_settings (name, value, changed_by, source, changes) VALUES (:name, :value, :by, 'screen', :changes)"
        ), {"name": name, "value": json.dumps(value, ensure_ascii=False), "by": by[:100], "changes": json.dumps(changes)})
    forget()


async def history(name: str, limit: int = 20) -> list[dict[str, Any]]:
    """変えた記録(新しい順)。だれ・いつ・どの項目(値は画面のいまの値で見る)"""
    from .data_api import db

    async with db() as conn:
        rows = (await conn.execute(text(
            f"SELECT changed_by, source, changes, created_on FROM app_settings WHERE name = :name ORDER BY created_on DESC LIMIT {int(limit)}"
        ), {"name": name})).mappings().all()
    return [{"at": _iso(r["created_on"]), "by": r["changed_by"] or "", "source": r["source"] or "", "changes": _keys(r["changes"])} for r in rows]


def _keys(v: Any) -> list[str]:
    try:
        got = json.loads(v or "[]")
    except ValueError:
        return []
    return [str(x) for x in got] if isinstance(got, list) else []


def _iso(v: Any) -> Any:
    # 取り込みの記録(bq_import._iso)と同じ形にする(まぜて並べるため)
    return sc.serialize(v) if v is not None else None


# ---- 窓口


def _actor(request: Request) -> str:
    return unquote(request.headers.get("x-ccp-actor", "")).strip()[:100]


async def _denied(request: Request) -> dict[str, Any] | None:
    from .data_api import db
    from .identity import admin_denied

    async with db() as conn:
        why = await admin_denied(conn, request)
    return {"success": False, "error": {"message": why, "code": "forbidden"}} if why else None


def _bad(group: str) -> dict[str, Any] | None:
    return None if group in GROUPS else {"success": False, "error": {"message": f"知らない設定です: {group}"}}


async def _view(group: str) -> dict[str, Any]:
    await ensure()
    row = _rows.get(group)
    past = await history(group)
    copied = next((h for h in reversed(past) if h["source"] == "env"), None)
    return {
        "values": current(group),
        "defaults": {k: d for k, (_e, d) in fields(group).items()},
        "env": {k: e for k, (e, _d) in fields(group).items()},
        "saved": row is not None,
        "updatedAt": _iso(row["at"]) if row else None,
        "updatedBy": row["by"] if row else None,
        "copiedFromEnvAt": copied["at"] if copied else None,
        "history": past,
        "choices": {"thinking": list(THINKING)} if group == "ai" else {},
    }


@router.get("/{group}")
async def get_group(group: str, request: Request) -> dict[str, Any]:
    if (bad := _bad(group)) or (bad := await _denied(request)):
        return bad
    return {"success": True, "data": await _view(group)}


@router.put("/{group}")
async def put_group(group: str, request: Request) -> dict[str, Any]:
    if (bad := _bad(group)) or (bad := await _denied(request)):
        return bad
    body = await request.json()
    try:
        value = clean(group, (body or {}).get("values") or {})
    except Invalid as e:
        return {"success": False, "error": {"message": str(e)}}
    await ensure()
    before = current(group)
    changes = sorted(k for k in value if str(value[k]) != str(before.get(k)))
    if changes or group not in _rows:
        await save(group, value, _actor(request), changes)
        await ensure()
    return {"success": True, "data": await _view(group)}


@router.post("/bq/try")
async def try_bq(request: Request) -> dict[str, Any]:
    """保存の前に、入れた値で読んで確かめる(bq-check と同じ確かめ。何も書かない)。only で出力を絞る"""
    if bad := await _denied(request):
        return bad
    body = await request.json()
    try:
        values = clean("bq", {**current("bq"), **((body or {}).get("values") or {})})
    except Invalid as e:
        return {"success": False, "error": {"message": str(e)}}
    only = [str(x) for x in (body or {}).get("only") or []] or None
    from .bq_import import _bq_error, check

    try:
        with trying("bq", values):
            return {"success": True, "data": await check(only)}
    except dbready.DbNotReady:
        raise
    except Exception as e:  # noqa: BLE001
        return _bq_error(e, "確認")
