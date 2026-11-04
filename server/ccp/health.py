"""設定の健康診断(settings.setup。2026-11-03 利用者「忘れていても問題ないように」)。

設定はめったにしないので、手順を忘れる。サーバーの側が「足りない物と、次にやること」を 1 行ずつ教える。
同じ diagnose() を、3 か所から呼ぶ(中身を 1 つにして、言うことがずれないように):
  python -m ccp.cli check        ターミナル(check.py が行にして出す)
  ⚙ →「設定の状態」              画面(GET /api/settings/health。管理する人だけ)
  サーバーの起動のとき           ログに「足りない」を出し、管理する人の ⚙ に赤い点(GET /api/settings/health/summary)

行の状態: ok = 済み / missing = 足りない / failed = 確認に失敗 / warn = 注意(動くが、気にしてほしい)。
full=True は、AI を 1 回呼び、BigQuery の表を読んで列まで確かめる(数秒〜十数秒)。起動のときは full=False で、設定があるか・届くかだけを見る。
パスワード・鍵は出さない。何も変えない(DB は SELECT だけ。BigQuery は表の情報と、問い合わせの試し(料金なし)だけ)。
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request

from . import appsettings, dbready

log = logging.getLogger("ccp.health")
router = APIRouter(prefix="/api/settings/health")

SERVER = Path(__file__).resolve().parent.parent


@dataclass
class Item:
    """1 行。area は組(db / google / ai / bq / sync / assets / guard / static)。goto は ⚙ で直す所(ai / dataimport)"""

    area: str
    status: str
    text: str
    fix: str = ""
    goto: str = ""


class _Out(list):
    def add(self, area: str, status: str, text: str, fix: str = "", goto: str = "") -> None:
        self.append(Item(area, status, text, fix, goto))


# ---- DB


def db_target() -> tuple[str, str | None, int | None]:
    """接続の経路と、ホスト・ポート(パスワードは返さない)。
    ホストは、CCP が実際に使う読み方(SQLAlchemy)で求める(ふつうの URL の読み方とは、@ の扱いが違うことがあるため)"""
    url = os.getenv("DATABASE_URL")
    if url:
        from sqlalchemy.engine import make_url

        try:
            u = make_url(url)
        except Exception as e:  # noqa: BLE001 — 読めない URL は、そのまま知らせる
            return f"DATABASE_URL(読めません: {e})", None, None
        return f"DATABASE_URL(scheme={u.drivername} host={u.host} port={u.port or 5432} db={u.database} user={u.username})", u.host, u.port or 5432
    return "なし", None, None


async def _db(out: _Out, full: bool) -> bool:
    """つながって、表がそろっていれば True(そのあとの DB を使う確かめに進む)"""
    target, host, _port = db_target()
    if target == "なし":
        out.add("db", "missing", "DB のつなぎ先(DATABASE_URL)がありません", "環境変数かサーバーの設定のファイルに DATABASE_URL を書いて、起動し直す")
        return False
    url = os.getenv("DATABASE_URL", "")
    bad = False
    if not url.startswith("postgresql+asyncpg://"):
        out.add("db", "failed", "DATABASE_URL の先頭が postgresql+asyncpg:// ではありません", "先頭を postgresql+asyncpg:// にする")
        bad = True
    if url.split("://", 1)[-1].split("/", 1)[0].count("@") > 1:
        out.add("db", "failed", "DATABASE_URL に @ が 2 つ以上あります(@ の後ろがホスト名と読まれます)", "パスワードの中の @ を %40 に置き換える")
        bad = True
    if host is not None:
        try:
            await asyncio.wait_for(asyncio.to_thread(socket.gethostbyname, host), 10)
        except (OSError, asyncio.TimeoutError) as e:
            out.add("db", "failed", f"DB のホスト {host} が見つかりません({type(e).__name__})", "ホスト名の書き間違い、パスワードの @ を %40 にしていない、などを確かめる")
            return False
    if bad:
        return False
    # 止まることのある DB では、起動のときの確かめのためだけに起こさない(使うときに起きる)
    if not full and dbready.controller() is not None:
        out.add("db", "ok", f"接続先: {target}(DB は使うときに起こします)")
        return False
    from sqlalchemy import text

    from . import schema as sc
    from .data_api import db

    try:
        async with db() as conn:
            version = (await asyncio.wait_for(conn.execute(text("SELECT version()")), 15)).scalar_one()
            have = {r[0] for r in (await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))).all()}
    except dbready.DbNotReady:
        out.add("db", "warn", "DB を起こしています。少し待ってから、もう一度確かめてください")
        return False
    except Exception as e:  # noqa: BLE001 — 原因を、そのまま見せる
        out.add("db", "failed", f"DB につながりません({type(e).__name__}: {str(e)[:200]})", "DB が動いているか、ユーザー・パスワード・DB の名前を確かめる(Workbench は scripts/workbench.sh pg-start)")
        return False
    want = {t.pg for t in sc.load().tables.values()}
    missing = sorted(want - have)
    out.add("db", "ok", f"つながりました({str(version).split(',')[0]})。{target}")
    if missing:
        out.add("db", "missing", f"CCP の表が {len(missing)} 個足りません({', '.join(missing[:5])}{' ほか' if len(missing) > 5 else ''})", "python -m ccp.cli migrate(引っ越し用のパックを取り込むときは import-pack でも作られる)")
        return False
    # 仕事の設定(BigQuery の場所・AI のモデル)は DB にある。このあとの確かめは、DB の値で行う
    await appsettings.ensure()
    return True


# ---- Google の認証と AI


async def _google(out: _Out) -> bool:
    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project:
        out.add("google", "missing", "GOOGLE_CLOUD_PROJECT がありません(AI と BigQuery が使えません)", "サーバーの設定に、Vertex AI を使う Google Cloud のプロジェクトを書いて、起動し直す")
    try:
        from .creds import get_credentials

        creds = await asyncio.wait_for(asyncio.to_thread(get_credentials), 20)
    except Exception as e:  # noqa: BLE001
        out.add("google", "failed", f"Google の認証が取れません({type(e).__name__})", "サーバーを動かすアカウント(サービスアカウント)の認証が、環境から渡されているかを確かめる")
        return False
    who = getattr(creds, "service_account_email", None) or "このサーバーのアカウント"
    out.add("google", "ok", f"Google の認証: {who}" + (f" / プロジェクト {project} / 場所 {os.getenv('GOOGLE_CLOUD_LOCATION', 'global')}" if project else ""))
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        out.add("google", "warn", "Gemini の API キーの変数がありますが、CCP は使いません(Vertex AI の形で、アカウントの権限を使う)")
    return bool(project)


def outlet_reach() -> Item:
    """AI の出口の URL に届くか(つなぐだけ。AI は呼ばない。合言葉は出さない)"""
    from urllib.parse import urlsplit

    url = str(appsettings.get("ai", "outlet_url") or "").strip()
    if not url:
        return Item("ai", "ok", "AI の出口なし(AI は Gemini を使う)")
    u = urlsplit(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        return Item("ai", "failed", "AI の出口の URL が http:// か https:// で始まる URL ではありません", "⚙ →「AI の設定」で直す", "ai")
    # 表示は、URL の中の利用者名・パスワード・問い合わせの部分を除く
    shown = f"{u.scheme}://{u.hostname}{f':{u.port}' if u.port else ''}{u.path}"
    token = "あり" if os.getenv("AI_OUTLET_TOKEN", "").strip() else "なし"
    try:
        socket.create_connection((u.hostname, u.port or (443 if u.scheme == "https" else 80)), timeout=3).close()
    except OSError as e:
        return Item("ai", "failed", f"AI の出口 {shown} に届きません({type(e).__name__})", "層が動いているか、URL とポートを確かめる。Gemini に戻すなら、⚙ →「AI の設定」で出口の URL を空にする", "ai")
    return Item("ai", "ok", f"AI の出口 {shown} に届きます(合言葉: {token}、待ち時間 {appsettings.get('ai', 'outlet_timeout')} 秒)。AI はすべて、この層に頼みます")


async def _ai(out: _Out, full: bool, google_ok: bool) -> None:
    outlet = bool(str(appsettings.get("ai", "outlet_url") or "").strip())
    where = "DB の設定" if appsettings.source("ai") == "db" else "環境変数"
    if not full:
        if outlet:
            out.append(await asyncio.to_thread(outlet_reach))
        elif google_ok:
            out.add("ai", "ok", f"Gemini を使います(モデル {appsettings.get('ai', 'model')}。{where})")
        return
    if not outlet and not google_ok:
        out.add("ai", "missing", "AI を呼べません(Google の設定が足りません)", "上の Google の行を直す")
        return
    from .ai import try_call

    r = await try_call()
    name = "AI の出口" if r["via"] == "outlet" else f"Gemini({r['model']})"
    if r["ok"]:
        out.add("ai", "ok", f"{name} を呼べました({r['seconds']} 秒。{where})")
    else:
        out.add("ai", "failed", f"{name} を呼べません: {r['message']}", "⚙ →「AI の設定」でモデル・出口を直し、「試す」で確かめる", "ai")


# ---- BigQuery と定期の取り込み


async def _bq(out: _Out, full: bool, db_ok: bool) -> None:
    from . import bq
    from .bq_import import DEST

    outputs = bq.configured()
    if not outputs:
        out.add("bq", "warn", "BigQuery の表の場所が 1 つもありません(BigQuery から取り込みません)", "取り込むときは ⚙ →「データの取り込み」で、行を開いて表の場所を入れる", "dataimport")
        return
    unset = [o.label for o in bq.OUTPUTS if o not in outputs]
    if not full:
        out.add("bq", "ok", f"表の場所: {len(outputs)} 個")
    else:
        try:
            client = await asyncio.to_thread(bq.client)
        except ImportError:
            out.add("bq", "failed", "パッケージ google-cloud-bigquery がありません", "server で .venv の pip install -r requirements.txt")
            return
        except Exception as e:  # noqa: BLE001 — 認証が取れない など
            out.add("bq", "failed", f"BigQuery のクライアントを作れません({type(e).__name__}: {str(e)[:200]})", "Google の行と、ジョブのプロジェクト(⚙ →「データの取り込み」の共通の設定)を確かめる", "dataimport")
            return
        for o in outputs:
            r = await asyncio.to_thread(bq.inspect, o, client)
            if r.error:
                out.add("bq", "failed", f"{o.label}: BigQuery の {r.where} を読めません({r.error})", "⚙ →「データの取り込み」で行を開き、表の場所を直して「接続を確認」", "dataimport")
                continue
            notes = [n for n in r.notes if not ("通りました" in n or "で見ます" in n)]
            if r.missing:
                out.add("bq", "failed", f"{o.label}: 必須の列がありません({', '.join(r.missing)})", "BigQuery の出力で、BIGQUERY_EXPORT.md の列名に AS で合わせる", "dataimport")
            elif not r.ok:
                out.add("bq", "failed", f"{o.label}: {'。'.join(notes) or '仕様どおりではありません'}", "python -m ccp.cli bq-check で、くわしく見る", "dataimport")
            else:
                out.add("bq", "ok", f"{o.label}: BigQuery の {r.where} → CCP の DB の表 {DEST[o.name]}(列は仕様どおり)")
            if r.missing_optional:
                out.add("bq", "warn", f"{o.label}: あると使う列がありません({', '.join(r.missing_optional)})")
    if unset:
        out.add("bq", "warn", f"場所のない出力: {'・'.join(unset)}(取り込みません)", "使うなら ⚙ →「データの取り込み」で場所を入れる", "dataimport")
    if db_ok:
        await _sync(out)


async def _sync(out: _Out) -> None:
    from . import bq
    from .bq_import import SETTINGS_NAME, env_disabled, latest, parse_settings

    if env_disabled():
        out.add("sync", "warn", "定期の取り込みは、環境変数(BQ_AUTO_SYNC=0)で止めています(画面の入・切は効きません)", "画面で決めるには、サーバーの設定からその行を消して、起動し直す", "dataimport")
    elif parse_settings(appsettings.raw(SETTINGS_NAME))["enabled"]:
        out.add("sync", "ok", "定期の取り込み: 入")
    else:
        out.add("sync", "warn", "定期の取り込み: 切(だれかが画面を開いたときだけ確かめます)", "⚙ →「データの取り込み」の「定期の取り込み」", "dataimport")
    try:
        got = await latest()
    except Exception as e:  # noqa: BLE001
        out.add("sync", "failed", f"取り込みの記録を読めません({type(e).__name__})")
        return
    labels = {o.name: o.label for o in bq.OUTPUTS}
    for o in bq.configured():
        r = got.get(o.name)
        ok_at = ((r or {}).get("last_ok") or {}).get("imported_at")
        when = ok_at.strftime("%Y-%m-%d %H:%M") if ok_at else None
        if not r:
            out.add("sync", "warn", f"{labels[o.name]}: まだ取り込んでいません", "⚙ →「データの取り込み」の ⋯ →「今すぐ取り込む」", "dataimport")
        elif r["status"] != "ok":
            out.add("sync", "failed", f"{labels[o.name]}: 止めています({str(r['message'] or '')[:160]})。最後に取り込めたのは {when or 'まだ'}", "⚙ →「データの取り込み」で、その行の理由を見る", "dataimport")
        else:
            out.add("sync", "ok", f"{labels[o.name]}: 最後に取り込めたのは {when}")


# ---- 写真・守り・画面


def _assets(out: _Out) -> None:
    d = os.getenv("ASSET_DIR")
    if d:
        p = Path(d)
        if not p.is_absolute():
            out.add("assets", "warn", f"写真の場所(ASSET_DIR={d})が相対パスです", "起動する場所で見つからなくなるので、絶対パスにする")
        if not p.is_dir():
            out.add("assets", "missing", f"写真の場所(ASSET_DIR={d})のフォルダがありません", "フォルダを作るか、引っ越し用のパックを取り込む")
            return
        counts = {k: len(list((p / k).glob("*"))) if (p / k).is_dir() else 0 for k in ("products", "heroes")}
        if not os.access(p, os.W_OK):
            out.add("assets", "failed", f"写真の場所(ASSET_DIR={d})に書けません", "サーバーを動かすユーザーに、書く権限を付ける")
        elif counts["products"] + counts["heroes"] == 0:
            out.add("assets", "missing", f"写真の場所(ASSET_DIR={d})に写真がありません", "引っ越し用のパックを取り込む(import-pack)")
        else:
            out.add("assets", "ok", f"写真: ASSET_DIR={d}(商品 {counts['products']} 点・メイン画像 {counts['heroes']} 点)")
    elif os.getenv("ASSET_BUCKET") or os.getenv("STATE_BUCKET"):
        out.add("assets", "ok", "写真: バケットから配ります")
    else:
        out.add("assets", "warn", "写真の場所(ASSET_DIR)がありません。写真の代わりにイラストが出ます", "引っ越し用のパックを取り込んだら、ASSET_DIR を設定する")


async def _guard(out: _Out) -> None:
    """入口の認証(差し込み口 identity.py)。どのアダプターか・ログインの発行元に届くか"""
    from . import identity, oidc

    mode = identity.auth_mode()
    if mode == "oidc":
        cfg = oidc.config()
        if cfg is None:
            out.add("guard", "missing", f"入口の認証: ログイン(OIDC)の設定が足りません({', '.join(oidc.missing())})。いまは、だれも画面を開けません", "アプリの登録の発行元・クライアント ID・クライアントシークレットを環境変数に入れて、起動し直す(docs/WORKBENCH.md の 7.1)")
            return
        try:
            await oidc.discover(cfg, fresh=True)
        except Exception as e:  # noqa: BLE001
            out.add("guard", "failed", f"入口の認証: ログイン(OIDC)の発行元に届きません({cfg.issuer}: {e})", "OIDC_ISSUER の綴り(Entra は https://login.microsoftonline.com/<テナント ID>/v2.0)と、サーバーから外へ出られるかを見る")
            return
        back = (cfg.public_url or "<画面のアドレス>") + "/auth/callback"
        out.add("guard", "ok", f"入口の認証: ログイン(OIDC。{cfg.issuer})。発行元に届きます。戻り先の URL: {back}")
        if os.getenv("APP_PASSWORD"):
            out.add("guard", "warn", "画面のパスワード(APP_PASSWORD)は、ログインを使っているので効いていません", "要らなければ消す")
        if not cfg.public_url:
            out.add("guard", "warn", "画面のアドレス(CCP_PUBLIC_URL)がないので、戻り先の URL を、届いた依頼から作ります", "手前の機械が X-Forwarded-Proto・Host を付けないなら、CCP_PUBLIC_URL に https://… を設定する")
    elif mode == "basic":
        if os.getenv("APP_PASSWORD"):
            out.add("guard", "ok", "入口の認証: 画面のパスワード(APP_PASSWORD)があります(人は分かりません)")
        else:
            out.add("guard", "missing", "入口の認証: CCP_AUTH=basic なのに、画面のパスワード(APP_PASSWORD)がありません。いまは、だれも画面を開けません", "APP_PASSWORD を設定する")
    elif mode == "iap":
        out.add("guard", "ok", "入口の認証: 手前のログイン(IAP)で守られています")
    elif mode == "none":
        if os.getenv("CCP_AUTH", "").strip().lower() == "none":
            out.add("guard", "warn", "入口の認証: なし(CCP_AUTH=none)。だれでも画面を開けます", "外から開ける置き先なら、ログイン(OIDC_ISSUER など)か APP_PASSWORD を設定して、CCP_AUTH を消す")
        else:
            # 外から開ける状態で黙って動き出さないように、このサーバーの中から直に届いた依頼だけを通す(identity.admit)。中継を通ると開けない
            out.add(
                "guard",
                "missing",
                "入口の認証がありません。このサーバーの中から直に(http://127.0.0.1:…)しか開けず、中継(Jupyter の /proxy/・nginx など)や外からは開けません",
                "ログイン(OIDC_ISSUER・OIDC_CLIENT_ID・OIDC_CLIENT_SECRET)か APP_PASSWORD を設定する。中継の手前でログインしている(Jupyter の中継など)ので CCP では守らないなら、CCP_AUTH=none",
            )
    else:
        out.add("guard", "missing", f"入口の認証: CCP_AUTH の値({mode})が分かりません。いまは、だれも画面を開けません", "oidc / basic / iap / none のどれかにする")
    _devtools_guard(out, mode)


def _devtools_guard(out: _Out, mode: str) -> None:
    """開発用の画面(X103)。ログインがあれば開発者だけに絞れるが、なければ入れる人を見分けられない(BigQuery の SQL も流せる)"""
    from .devtools import enabled

    if not enabled():
        return
    if mode in ("oidc", "iap") or os.getenv("CCP_DEV_USER_EMAIL", "").strip():
        out.add("guard", "ok", "開発用の画面: 有効。ログインした開発者(ユーザーの開発者の印)だけが開けます")
    else:
        out.add(
            "guard",
            "warn",
            "開発用の画面: 有効・ログインなしで開けます(画面に入れる人は、だれでも開発用の画面に入れます)",
            "使わないときは CCP_DEVTOOLS を消す。使い続けるなら、ログイン(OIDC_ISSUER など)を設定すると、開発者だけに絞れる",
        )


def _static(out: _Out) -> None:
    static = Path(os.getenv("STATIC_DIR") or SERVER.parent / "dist-gcp")
    if (static / "index.html").is_file():
        out.add("static", "ok", f"画面のビルドがあります({static})")
    else:
        out.add("static", "missing", f"画面のビルドがありません({static})", "リポジトリのルートで npm ci → npm run build:gcp")


# 外に出られるかを見る先。中身のない返事だけを返す、どこからでも届くはずの公開の URL
NET_PROBE = "https://www.gstatic.com/generate_204"


def _can_reach(url: str = NET_PROBE, timeout: float = 5) -> str | None:
    """届けば None、届かなければ理由。プロキシの環境変数(HTTPS_PROXY など)にも従う。返事の中身は見ない"""
    import urllib.error
    import urllib.request

    try:
        urllib.request.urlopen(url, timeout=timeout).close()  # noqa: S310 — 決まった https の URL だけ
    except urllib.error.HTTPError:
        return None  # 返事が来たので、外には出られている
    except Exception as e:  # noqa: BLE001
        return f"{type(e).__name__}: {str(e)[:120]}"
    return None


async def _net(out: _Out) -> None:
    """サーバーから外に出られるか(BigQuery・Gemini・ログインの発行元の前提。止まっていると、それらの行の失敗の理由が分かりにくいので、先に出す)"""
    why = await asyncio.to_thread(_can_reach)
    if why is None:
        out.add("net", "ok", "サーバーから外(インターネット)に出られます")
    else:
        out.add("net", "failed", f"サーバーから外(インターネット)に出られません({why})", "ファイアウォール・NAT・プロキシ(環境変数 HTTPS_PROXY)を確認する。外に出られないと、BigQuery・AI・ログインも動きません")


async def diagnose(full: bool = True) -> list[Item]:
    out = _Out()
    # 外への確かめは、画面と check のときだけ(起動を待たせない)
    if full:
        await _net(out)
    db_ok = await _db(out, full)
    google_ok = await _google(out)
    await _ai(out, full, google_ok)
    await _bq(out, full, db_ok)
    _assets(out)
    await _guard(out)
    _static(out)
    return list(out)


# ---- 窓口と、起動のときの確かめ

_last: dict[str, Any] = {"items": None, "at": 0.0, "full": False}
# 赤い点のために、起動のときの結果を使い回す長さ(画面の確かめで新しくなる)
SUMMARY_TTL_S = 30 * 60


def _remember(items: list[Item], full: bool) -> None:
    _last.update(items=items, at=time.time(), full=full)


def counts(items: list[Item]) -> dict[str, int]:
    return {s: sum(1 for i in items if i.status == s) for s in ("ok", "missing", "failed", "warn")}


async def at_startup() -> None:
    """起動のときに軽く確かめ、足りない・失敗をログに出す(管理する人の ⚙ の赤い点にも使う)"""
    try:
        items = await diagnose(full=False)
    except Exception:  # noqa: BLE001 — 確かめの失敗で、起動を止めない
        log.exception("設定の健康診断に失敗しました")
        return
    _remember(items, False)
    bad = [i for i in items if i.status in ("missing", "failed")]
    for i in bad:
        log.warning("設定が%s: %s%s", "足りません" if i.status == "missing" else "確かめられません", i.text, f"(直し方: {i.fix})" if i.fix else "")
    if bad:
        log.warning("⚙ →「設定の状態」か python -m ccp.cli check で、くわしく見られます")


async def _denied(request: Request) -> dict[str, Any] | None:
    from .data_api import db
    from .identity import admin_denied

    async with db() as conn:
        why = await admin_denied(conn, request)
    return {"success": False, "error": {"message": why, "code": "forbidden"}} if why else None


@router.get("")
async def get_health(request: Request) -> dict[str, Any]:
    """⚙ →「設定の状態」。AI を 1 回呼び、BigQuery の表を読む(数秒〜十数秒)"""
    if bad := await _denied(request):
        return bad
    items = await diagnose(full=True)
    _remember(items, True)
    return {"success": True, "data": {"items": [asdict(i) for i in items], "counts": counts(items), "checkedAt": time.time()}}


@router.get("/summary")
async def get_summary(request: Request) -> dict[str, Any]:
    """⚙ の赤い点。起動のとき・画面で確かめた結果を使い回し、古ければ軽く確かめ直す(AI は呼ばない)"""
    if bad := await _denied(request):
        return bad
    if _last["items"] is None or time.time() - _last["at"] > SUMMARY_TTL_S:
        _remember(await diagnose(full=False), False)
    return {"success": True, "data": counts(_last["items"])}
