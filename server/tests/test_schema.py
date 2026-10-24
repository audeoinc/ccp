"""schema.py(名前・値の変換、絞り込みの解析、テーブルを作る SQL)の単体テスト。DB には接続しない。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import schema as sc  # noqa: E402

GUID = "3f2c3d3e-1111-4a2b-8c3d-5e6f7a8b9c0d"


class SchemaTest(unittest.TestCase):
    def setUp(self) -> None:
        self.s = sc.load()

    def test_every_lookup_points_to_a_table(self) -> None:
        for t in self.s.tables.values():
            for lk in t.lookups:
                self.assertIn(lk.ref, self.s.tables, f"{t.name}.{lk.pg}")

    def test_creation_order_puts_referenced_tables_first(self) -> None:
        names = [t.name for t in self.s.creation_order()]
        for t in self.s.tables.values():
            for lk in t.lookups:
                self.assertLess(names.index(lk.ref), names.index(t.name))

    def test_ddl_has_no_legacy_prefix(self) -> None:
        self.assertFalse(any("cr854_" in stmt for stmt in self.s.ddl()))

    def test_to_db_takes_reference_id_and_ignores_primary_key(self) -> None:
        t = self.s.table("delivery_products")
        v = t.to_db({"id": GUID, "name": "x", "delivery_card_id": GUID, "sort_order": "2", "state_code": 0})
        self.assertEqual(v, {"name": "x", "delivery_card_id": uuid.UUID(GUID), "sort_order": 2, "state_code": 0})

    def test_bind_null_clears_the_reference(self) -> None:
        t = self.s.table("delivery_cards")
        self.assertEqual(t.to_db({"hero_image_id": None}), {"hero_image_id": None})

    def test_unknown_field_is_rejected_but_read_only_fields_are_ignored(self) -> None:
        t = self.s.table("products")
        with self.assertRaises(sc.BadRequest):
            t.to_db({"nope": 1})
        with self.assertRaises(sc.BadRequest):
            t.to_db({"delivery_card_id": f"/delivery_cards({GUID})"})  # 以前の参照の書き方は、もう受け付けない
        self.assertEqual(t.to_db({"id": GUID, "created_on": "2026-10-01T00:00:00Z", "category_name": "アウター"}), {})

    def test_to_api_formats_values(self) -> None:
        t = self.s.table("delivery_cards")
        row = {
            "id": uuid.UUID(GUID),
            "name": "n",
            "scheduled_at": datetime(2026, 10, 2, 1, 0, tzinfo=timezone.utc),
            "country": "US",
            "hero_image_id": uuid.UUID(GUID),
            "state_code": 0,
        }
        out = t.to_api(row)
        self.assertEqual(out["id"], GUID)
        self.assertEqual(out["scheduled_at"], "2026-10-02T01:00:00Z")
        self.assertEqual(out["hero_image_id"], GUID)
        self.assertEqual(out["state_code"], 0)

    def test_choice_accepts_only_listed_values(self) -> None:
        t = self.s.table("delivery_cards")
        self.assertEqual(t.to_db({"channel": "app", "status": "approved"}), {"channel": "app", "status": "approved"})
        for bad in [{"channel": "push"}, {"status": 588230002}]:
            with self.assertRaises(sc.BadRequest, msg=str(bad)):
                t.to_db(bad)

    def test_legacy_values_are_converted_in_ddl(self) -> None:
        ddl = " ".join(self.s.table("delivery_cards").ddl())
        self.assertIn("ALTER COLUMN channel TYPE text", ddl)
        self.assertIn("WHEN '588230001' THEN 'app'", ddl)
        events = " ".join(self.s.table("events").ddl())
        self.assertIn("WHEN '588230003' THEN 'confirmed'", events)

    def test_convert_legacy_rows(self) -> None:
        name, rows = sc.convert_legacy_rows("cr854_deliverycards", [{"cr854_deliverycardid": GUID, "cr854_name": "n", "cr854_channel": 588230001, "_cr854_heroimage_value": GUID, "createdon": "2026-10-01T00:00:00Z", "statecode": 0}])
        self.assertEqual(name, "delivery_cards")
        self.assertEqual(rows, [{"id": GUID, "name": "n", "channel": "app", "hero_image_id": GUID, "created_on": "2026-10-01T00:00:00Z", "state_code": 0}])

    def test_numbers_serialize_as_int_or_float(self) -> None:
        self.assertEqual(sc.serialize(Decimal("9800.00")), 9800)
        self.assertEqual(sc.serialize(Decimal("4.70")), 4.7)

    def test_filter_eq_with_quote_escape_and_and(self) -> None:
        t = self.s.table("product_policies")
        sql, params = sc.parse_filter(t, "product_code eq 'P''07' and stage eq 'x'")
        self.assertEqual(sql, "product_code = :f0 AND stage = :f1")
        self.assertEqual(params, {"f0": "P'07", "f1": "x"})

    def test_filter_on_lookup_value_uses_uuid(self) -> None:
        t = self.s.table("delivery_products")
        sql, params = sc.parse_filter(t, f"delivery_card_id eq {GUID}")
        self.assertEqual(sql, "delivery_card_id = :f0")
        self.assertEqual(params["f0"], uuid.UUID(GUID))

    def test_filter_in(self) -> None:
        t = self.s.table("delivery_products")
        other = str(uuid.uuid4())
        sql, params = sc.parse_filter(t, f"delivery_card_id in ({GUID}, '{other}')")
        self.assertEqual(sql, "delivery_card_id IN (:f0, :f1)")
        self.assertEqual(params, {"f0": uuid.UUID(GUID), "f1": uuid.UUID(other)})

    def test_filter_or_is_wrapped_and_binds_after_and(self) -> None:
        t = self.s.table("product_policies")
        sql, params = sc.parse_filter(t, "stage eq 'a' and product_code eq 'P1' or stage eq null")
        self.assertEqual(sql, "(stage = :f0 AND product_code = :f1 OR stage IS NULL)")
        self.assertEqual(params, {"f0": "a", "f1": "P1"})

    def test_filter_in_limits(self) -> None:
        t = self.s.table("product_policies")
        for bad in ["stage in ()", "stage in ('a', null)", "stage in ('a'", f"stage in ({', '.join(['x'] * (sc.MAX_IN + 1))})", "stage eq 'a' and", "stage eq 'a' or"]:
            with self.assertRaises(sc.BadRequest, msg=bad):
                sc.parse_filter(t, bad)

    def test_filter_rejects_unsupported_syntax_and_sql_injection(self) -> None:
        t = self.s.table("products")
        # or が使えても、列でないもの(1 eq 1)は受け付けない
        for bad in ["name eq 'a' or 1 eq 1", "name eq 'a'; drop table products", "contains(name,'a')", "nope eq 1", "name in ('a') ) or (1 eq 1"]:
            with self.assertRaises(sc.BadRequest, msg=bad):
                sc.parse_filter(t, bad)

    def test_order_by(self) -> None:
        t = self.s.table("delivery_cards")
        self.assertEqual(sc.parse_order(t, ["scheduled_at asc,created_on desc"]), "scheduled_at ASC, created_on DESC")
        with self.assertRaises(sc.BadRequest):
            sc.parse_order(t, ["scheduled_at sideways"])


if __name__ == "__main__":
    unittest.main()
