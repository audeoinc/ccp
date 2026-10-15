"""動かす前の確認(python -m ccp.cli check)。

Workbench など、新しい環境で CCP を動かすときに、設定が読めているか・DB につながるか・写真と画面があるかを、まとめて確かめる。
パスワードは表示しない。何も変えない(DB には SELECT だけ)。
"""
from __future__ import annotations

import asyncio
import os
import socket
from pathlib import Path

OK, NG, WARN = "OK  ", "NG  ", "注意"


def _line(mark: str, text: str) -> None:
    print(f"  [{mark}] {text}")


def _db_target() -> tuple[str, str | None, int | None]:
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
    inst = os.getenv("CLOUD_SQL_INSTANCE")
    if inst:
        return f"Cloud SQL(CLOUD_SQL_INSTANCE={inst} user={os.getenv('DB_USER', 'ccp_app')} db={os.getenv('DB_NAME', 'ccp')})", None, None
    return "なし", None, None


async def _db_query() -> tuple[bool, str]:
    from sqlalchemy import text

    from .db import get_engine

    try:
        engine = await get_engine()
        async with engine.connect() as conn:
            version = (await asyncio.wait_for(conn.execute(text("SELECT version()")), 15)).scalar_one()
            tables = (await conn.execute(text("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"))).scalar_one()
            cards = None
            try:
                cards = (await conn.execute(text("SELECT count(*) FROM delivery_cards"))).scalar_one()
            except Exception:  # noqa: BLE001 — テーブルがまだないだけ
                pass
        await engine.dispose()
        detail = f"つながりました({str(version).split(',')[0]})。テーブル {tables} 個"
        detail += f"、配信カード {cards} 件" if cards is not None else "(CCP のテーブルはまだありません。import-pack か migrate で作られます)"
        return True, detail
    except Exception as e:  # noqa: BLE001 — 原因を、そのまま見せる
        return False, f"{type(e).__name__}: {e}"


def run() -> int:
    """確認して、NG の数を返す"""
    ng = 0
    server = Path(__file__).resolve().parent.parent

    print("■ DB")
    target, host, port = _db_target()
    if target == "なし":
        _line(NG, "接続先の設定がありません(DATABASE_URL、または CLOUD_SQL_INSTANCE)")
        ng += 1
    else:
        _line(OK, f"接続先: {target}")
        url = os.getenv("DATABASE_URL", "")
        if url and not url.startswith("postgresql+asyncpg://"):
            _line(NG, "DATABASE_URL の先頭は postgresql+asyncpg:// にしてください")
            ng += 1
        if url.split("://", 1)[-1].split("/", 1)[0].count("@") > 1:
            _line(NG, "DATABASE_URL に @ が 2 つ以上あります。パスワードの中の @ は %40 に置き換えてください(そのままだと、@ の後ろがホスト名と読まれます)")
            ng += 1
        if host is not None:
            try:
                addr = socket.gethostbyname(host)
                _line(OK, f"ホスト {host} → {addr}")
            except OSError as e:
                _line(NG, f"ホスト {host} が見つかりません({e})。ホスト名の書き間違い、パスワードの @ を %40 にしていない、などを確かめてください")
                ng += 1
                host = None
        if host is not None or os.getenv("CLOUD_SQL_INSTANCE"):
            ok, detail = asyncio.run(_db_query())
            _line(OK if ok else NG, detail)
            ng += 0 if ok else 1

    print("■ AI(Vertex AI の Gemini)")
    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if project:
        _line(OK, f"GOOGLE_CLOUD_PROJECT={project} / GOOGLE_CLOUD_LOCATION={os.getenv('GOOGLE_CLOUD_LOCATION', 'global')} / GEMINI_MODEL={os.getenv('GEMINI_MODEL', 'gemini-3.5-flash')}")
    else:
        _line(WARN, "GOOGLE_CLOUD_PROJECT がありません(AI のボタンが使えません。AI を使わないなら、このままでもよい)")
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        _line(WARN, "Gemini の API キーの変数がありますが、CCP は使いません(Vertex AI の形で、サービスアカウントの権限を使う)")

    print("■ 写真")
    d = os.getenv("ASSET_DIR")
    if d:
        p = Path(d)
        counts = {k: len(list((p / k).glob("*"))) if (p / k).is_dir() else 0 for k in ("products", "heroes")}
        if not p.is_absolute():
            _line(WARN, f"ASSET_DIR={d} は相対パスです。起動する場所によって見つからなくなるので、絶対パスにしてください")
        if counts["products"] + counts["heroes"] == 0:
            _line(NG, f"ASSET_DIR={d} に写真がありません(import-pack --yes で展開されます)")
            ng += 1
        else:
            _line(OK, f"ASSET_DIR={d}(商品 {counts['products']} 点・メイン画像 {counts['heroes']} 点)")
    elif os.getenv("ASSET_BUCKET") or os.getenv("STATE_BUCKET"):
        _line(OK, f"GCS のバケットから配ります({os.getenv('ASSET_BUCKET') or os.getenv('STATE_BUCKET')})")
    else:
        _line(WARN, "ASSET_DIR がありません。写真の代わりにイラストが出ます(引っ越し用のパックを取り込んだら、ASSET_DIR を設定)")

    print("■ 画面")
    static = Path(os.getenv("STATIC_DIR") or server.parent / "dist-gcp")
    if (static / "index.html").is_file():
        _line(OK, f"ビルドがあります({static})")
    else:
        _line(NG, f"ビルドがありません({static})。リポジトリのルートで npm ci → npm run build:gcp")
        ng += 1

    print("■ その他")
    for name in ("DB_CONTROL", "CCP_DEV_GCLOUD"):
        if os.getenv(name):
            _line(WARN, f"{name} は、Workbench では設定しません(本番・手元の開発用)")
    _line(OK if os.getenv("APP_PASSWORD") else WARN, "APP_PASSWORD(画面のパスワード)あり" if os.getenv("APP_PASSWORD") else "APP_PASSWORD なし(画面にパスワードをかけない。Workbench の中継で守られているなら、このままでもよい)")

    print()
    print("問題は見つかりませんでした" if ng == 0 else f"NG が {ng} 件あります。上の [NG] の行を直してください")
    return ng
