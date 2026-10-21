"""policies.py(マーケティングポリシーのファイルの読み分け)の単体テスト。DB には接続しない。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp.policies import check_rule, history_json, parse_rules, parse_sales, rule_markdown, rules_markdown  # noqa: E402

RULES_MD = """# ルール集: 表現の決まり
- 版: 2026-10-17
- 出どころ: ブランドガイドライン

## R-COPY-001 価格は税込みで書く
- 対象: copy, headline
- 強さ: must
- 市場: JP
- 確かめ方: 含めない /\\d[\\d,]*円(?!\\s*[(（]税込)/

価格を書くときは「1,980円(税込)」のように、税込みであることを添える。

## R-SEL-010 新作の配信に、在庫調整の商品を入れない
- applies_to: selection
- strength: must
- check: 除く 段階=在庫調整
- period: 2026-10-01 - 2026-12-31

新作・新入荷のテーマの配信では、在庫調整の商品を選ばない。

## R-TONE-002 口調は、落ち着いた丁寧語
- 対象: headline, copy, instructions
- 強さ: should

あおる表現は避け、落ち着いた丁寧語で書く。
"""

SALES_CSV = """week_start,market,scope,target,stage,priority,promo_period,focus,note
2026-10-19,US,all,,,,,"Outerwear first; win back lapsed members",
2026-10-19,US,product,410023,主力,1,2026-10-19 - 2026-11-15,,Lead item for the fall campaign
2026-10-19,US,category,Knitwear,定番,2,,,Rotate colors weekly
"""


class RulesTest(unittest.TestCase):
    def test_parses_three_rules(self) -> None:
        p = parse_rules(RULES_MD)
        self.assertEqual(p.title, "ルール集: 表現の決まり")
        self.assertEqual([r["rule_id"] for r in p.rows], ["R-COPY-001", "R-SEL-010", "R-TONE-002"])
        self.assertEqual(p.problems, [])
        r = p.rows[0]
        self.assertEqual((r["applies_to"], r["strength"], r["market"]), ("copy,headline", "must", "JP"))
        self.assertTrue(r["check_spec"].startswith("含めない /"))
        self.assertIn("税込み", r["body"])
        self.assertEqual((p.rows[1]["period_start"], p.rows[1]["period_end"]), ("2026-10-01", "2026-12-31"))
        self.assertEqual(p.rows[2]["title"], "口調は、落ち着いた丁寧語")

    def test_bad_rules_are_skipped_with_reasons(self) -> None:
        md = "## R-1 対象なし\n- 強さ: must\n\n本文\n\n## R-2 強さが変\n- 対象: copy\n- 強さ: maybe\n\n本文\n\n## R-3 ok\n- 対象: copy\n- 強さ: info\n\n本文\n\n## R-3 重複\n- 対象: copy\n- 強さ: info\n\n本文\n"
        p = parse_rules(md)
        self.assertEqual([r["rule_id"] for r in p.rows], ["R-3"])
        msgs = "\n".join(x.message for x in p.problems)
        self.assertIn("「対象」がありません", msgs)
        self.assertIn("must / should / info", msgs)
        self.assertIn("重なっています", msgs)

    def test_unknown_check_and_period(self) -> None:
        md = "## R-9 x\n- 対象: copy\n- 強さ: must\n- 確かめ方: なんとなく\n- 期間: 2026-12-31 - 2026-10-01\n\n本文\n"
        p = parse_rules(md)
        self.assertEqual(p.rows, [])
        msgs = "\n".join(x.message for x in p.problems)
        self.assertIn("確かめ方", msgs)
        self.assertIn("期間", msgs)


class SalesTest(unittest.TestCase):
    def test_parses_rows(self) -> None:
        p = parse_sales(SALES_CSV)
        self.assertEqual(p.problems, [])
        self.assertEqual(len(p.rows), 3)
        self.assertEqual(p.rows[0]["scope"], "all")
        self.assertEqual(p.rows[0]["focus"], "Outerwear first; win back lapsed members")
        self.assertEqual((p.rows[1]["target"], p.rows[1]["priority"], p.rows[1]["stage"]), ("410023", 1, "主力"))

    def test_bad_rows_are_skipped(self) -> None:
        csv_text = "week_start,market,scope,target\n2026-10-20,US,product,1\n2026-10-19,usa,product,1\n2026-10-19,US,product,\n2026-10-19,US,all,\n2026-10-19,US,all,\n"
        p = parse_sales(csv_text)
        self.assertEqual(len(p.rows), 1)
        msgs = "\n".join(x.message for x in p.problems)
        self.assertIn("月曜", msgs)
        self.assertIn("大文字 2 文字", msgs)
        self.assertIn("target", msgs)
        self.assertIn("重なっています", msgs)

    def test_missing_columns(self) -> None:
        p = parse_sales("week,market\n2026-10-19,US\n")
        self.assertEqual(p.rows, [])
        self.assertIn("必須の列がありません", p.problems[0].message)


class ScreenEditTest(unittest.TestCase):
    """画面で決まりを直す(X61)。取り込みと同じ読み分けで確かめ、書き出したものは取り込み直せる"""

    LIMIT = {"rule_id": "R-LIMIT-001", "title": "同じ商品は週 2 回まで", "applies_to": "selection", "strength": "must",
             "market": "JP", "channel": "email, app", "check_spec": "上限 週 2 回", "body": "同じ商品を、同じ週に 3 本以上の配信に載せない。"}

    def test_valid_rule(self) -> None:
        row, problems = check_rule(self.LIMIT)
        self.assertIsNotNone(row)
        self.assertEqual(problems, [])
        self.assertEqual(row["check_spec"], "上限 週 2 回")
        self.assertEqual(row["channel"], "email,app")

    def test_invalid_rule(self) -> None:
        row, problems = check_rule({**self.LIMIT, "strength": "maybe"})
        self.assertIsNone(row)
        self.assertTrue(any("強さ" in p.message for p in problems))
        row, problems = check_rule({**self.LIMIT, "check_spec": "上限 月 2 回"})
        self.assertIsNone(row)
        row, problems = check_rule({**self.LIMIT, "rule_id": ""})
        self.assertIsNone(row)
        row, problems = check_rule({**self.LIMIT, "period_start": "2026-12-01", "period_end": "2026-10-01"})
        self.assertIsNone(row)

    def test_period_one_side(self) -> None:
        row, _ = check_rule({**self.LIMIT, "period_start": "2026-11-01"})
        self.assertEqual((row["period_start"], row["period_end"]), ("2026-11-01", "2026-11-01"))

    def test_export_round_trip(self) -> None:
        parsed = parse_rules(RULES_MD).rows
        md = rules_markdown(parsed, "表現の決まり")
        again = parse_rules(md)
        self.assertEqual(again.problems, [])
        keys = ("rule_id", "title", "applies_to", "strength", "market", "channel", "period_start", "period_end", "check_spec", "body")
        self.assertEqual([{k: r[k] for k in keys} for r in again.rows], [{k: r[k] for k in keys} for r in parsed])
        self.assertIn("## R-LIMIT-001 同じ商品は週 2 回まで", rule_markdown(self.LIMIT))

    def test_history_json(self) -> None:
        self.assertEqual(history_json(None), "")
        self.assertIn('"rule_id": "R-1"', history_json({"rule_id": "R-1", "title": "t"}))


if __name__ == "__main__":
    unittest.main()
