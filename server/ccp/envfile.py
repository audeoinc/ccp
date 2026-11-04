"""起動に要る値を置く、サーバーの設定のファイル(初期設定の画面が書く。settings.setup。2026-11-03 利用者)。

置き場所は server/ccp.env(CCP_ENV_FILE で変えられる)。1 行 1 つの KEY=VALUE。
- 起動のときに読み込むが、**すでにある環境変数は上書きしない**(環境から渡された値(Secrets など)を優先する。
  どちらが効いているか分からなくならないように、画面にも「環境から設定」と出して、変えられないようにする)。
- 書くときは、本人だけが読める権限(600)・改行は LF。ほかの行(コメントなど)はそのまま残す。
- 秘密(パスワード・鍵)もここに入るので、Git に入れない(.gitignore)。
- コンテナなどでは、入れ替えや再起動でファイルが消える。置き方を環境の名前で見分けず、CCP_ENV_FILE の値で決める(mode):
  指定なし = 既定の場所(消えるかもしれないので、画面と健康診断が注意を出す)/ パスを指定 = 人が残る場所を選んだ /
  off = ファイルを使わない(すべて環境変数で渡す運用。画面の欄は閉じる)。
"""
from __future__ import annotations

import os
import re
from pathlib import Path

DEFAULT = Path(__file__).resolve().parent.parent / "ccp.env"
_LINE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$")

# 環境から渡された値の名前(ファイルから入れた値と見分ける。読み込む前に、プロセスにあった値)
_from_env: set[str] = set()
_from_file: set[str] = set()


class FileOff(OSError):
    """CCP_ENV_FILE=off なので、書けない"""


def mode() -> str:
    """default(既定の場所)/ chosen(人が場所を指定した)/ off(ファイルを使わない)"""
    v = os.getenv("CCP_ENV_FILE", "").strip()
    if not v:
        return "default"
    return "off" if v.lower() == "off" else "chosen"


def path() -> Path:
    return DEFAULT if mode() != "chosen" else Path(os.environ["CCP_ENV_FILE"].strip())


def _unquote(v: str) -> str:
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
        return v[1:-1]
    return v


def read(p: Path | None = None) -> dict[str, str]:
    if p is None and mode() == "off":
        return {}
    p = p or path()
    if not p.is_file():
        return {}
    out: dict[str, str] = {}
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.lstrip().startswith("#"):
            continue
        m = _LINE.match(line)
        if m:
            out[m.group(1)] = _unquote(m.group(2))
    return out


def load() -> None:
    """ファイルの値を、環境変数にない名前だけ入れる(起動のときに 1 回)"""
    # 空の環境変数は、渡されていないのと同じに扱う(空の行を書いた起動のスクリプトで、ファイルの値が消えないように)
    _from_env.update(k for k, v in os.environ.items() if v)
    for k, v in read().items():
        if not os.environ.get(k):
            os.environ[k] = v
            _from_file.add(k)


def from_env(key: str) -> bool:
    """環境から渡された値か(画面では変えられない)"""
    return key in _from_env and key not in _from_file and bool(os.environ.get(key))


def locked(key: str) -> bool:
    """画面で変えられないか(環境から渡された値か、ファイルを使わない運用)"""
    return from_env(key) or mode() == "off"


def from_file() -> list[str]:
    """いまファイルから効いている名前(値は出さない)"""
    return sorted(_from_file)


def write(values: dict[str, str | None]) -> None:
    """名前ごとに書き換える(None は消す)。プロセスの環境変数にも入れて、起動し直さずに効かせる。環境から渡された名前は書かない"""
    if mode() == "off":
        raise FileOff("CCP_ENV_FILE=off")
    p = path()
    lines = p.read_text(encoding="utf-8").splitlines() if p.is_file() else ["# CCP のサーバーの設定(初期設定の画面が書く。秘密を含むので、Git に入れない・人に渡さない)"]
    todo = {k: v for k, v in values.items() if not from_env(k)}
    out: list[str] = []
    for line in lines:
        m = _LINE.match(line)
        if m and not line.lstrip().startswith("#") and m.group(1) in todo:
            v = todo.pop(m.group(1))
            if v is not None:
                out.append(f"{m.group(1)}={_quote(v)}")
            continue
        out.append(line)
    out += [f"{k}={_quote(v)}" for k, v in todo.items() if v is not None]
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_text("\n".join(out) + "\n", encoding="utf-8", newline="\n")
    try:
        os.chmod(tmp, 0o600)
    except OSError:  # 権限を付けられない置き場所(Windows など)でも、書くことは続ける
        pass
    os.replace(tmp, p)
    for k, v in values.items():
        if from_env(k):
            continue
        if v is None:
            os.environ.pop(k, None)
            _from_file.discard(k)
        else:
            os.environ[k] = v
            _from_file.add(k)


def _quote(v: str) -> str:
    # 空白・# を含む値は、シェルで読んでも同じになるように、引用符で囲む
    return f"'{v}'" if re.search(r"[\s#'\"$`\\]", v) and "'" not in v else v
