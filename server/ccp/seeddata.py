"""見本のデータ(server/seed.json)。`python -m ccp.cli seed` で入り、`remove-seed` で消す。

見本は、人が明示したときだけ入れる(起動・DB が空のときに自動では入れない)。
見本の商品が入ったままだと、データの入口(BigQuery)の商品と合わず、取り込みが止まる(bq_import.spu_mismatch)。
そのとき「見本が入っているため」と消し方を出せるよう、見本の商品コードと行の ID を、ここで引けるようにする。
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

SEED_PATH = Path(__file__).resolve().parent.parent / "seed.json"
REMOVE_HINT = "cd server && .venv/bin/python -m ccp.cli remove-seed(数えるだけ)→ 中身を確かめて --yes"


@lru_cache(maxsize=1)
def load() -> dict[str, list[dict[str, Any]]]:
    """表の名前 → 見本の行。ファイルがなければ空(見本を持たない配り方でも動くように)"""
    try:
        return json.loads(SEED_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def product_codes() -> set[str]:
    return {str(r["product_code"]) for r in load().get("products", []) if r.get("product_code")}
