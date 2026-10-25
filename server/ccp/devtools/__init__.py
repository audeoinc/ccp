"""開発用の画面(/dev/)の API(バックログ B10。設計は docs/DEVTOOLS.md)。

利用先の Workbench で、CCP が読むデータ(BigQuery の 6 つの出力・ポリシーの文書)を用意するための道具。
BigQuery に問い合わせを投げられるのは、Workbench で動くこのサーバーだけなので、試しと答え合わせをここに置く。

  GET  /api/dev/status          有効か・ジョブのプロジェクト・アカウント・作業フォルダ
  GET  /api/dev/settings        作業の設定(よく見るデータセット・出す先 など。server/devwork/settings.json)
  PUT  /api/dev/settings
  GET  /api/dev/bq/datasets     ?project=  データセットの一覧
  GET  /api/dev/bq/tables       ?dataset=<プロジェクト>.<データセット>  表とビューの一覧
  GET  /api/dev/bq/table        ?ref=<プロジェクト>.<データセット>.<表>  列(入れ子は a.b の形に開く)・行数・パーティション
  GET  /api/dev/bq/preview      ?ref=…  先頭の行(list_rows。問い合わせではないので料金なし)
  POST /api/dev/bq/dryrun       {sql}  料金なしの試し。文の種類・読む量・結果の列
  POST /api/dev/bq/run          {sql, max_rows, run_id}  SELECT だけを、読む量の上限を付けて流す
  POST /api/dev/bq/cancel       {run_id}  流している途中の SELECT を止める(BigQuery のジョブを取り消す)
  GET  /api/dev/bq/projects     見られるプロジェクト(データセットを、名前の一部で探すため)
  GET  /api/dev/ai/models       使えるモデル(賢い順)と既定
  GET  /api/dev/work            6 つの出力の版の一覧・採用の版・出す先
  POST /api/dev/work/{出力}     SQL を新しい版として保存する   GET /api/dev/work/{出力}/{版}  版を開く
  PUT  /api/dev/work/{出力}/adopt  採用の版を決める          PUT /api/dev/work/target       出す先を決める
  POST /api/dev/check           答え合わせ(全件を流して bq_validate。run=false なら読む量の見積もりだけ)
  GET  /api/dev/gcs/list        ?bucket=&prefix=  GCS のフォルダ 1 段分(読むだけ)
  POST /api/dev/gcs/extract     選んだ文書を文字にする(Excel はシートごとに CSV の形。PDF は文字にしない)
  GET  /api/dev/policy/drafts   前に書き直したファイル(server/devwork/policies/)
  POST /api/dev/tasks/chat・/tasks/policy-convert・/tasks/call  時間のかかる処理を裏で走らせ、受付番号を返す
                                chat = Gemini と会話して SQL を組み立てる(前提はサーバーで組み立てる)。policy-convert = 文書を POLICY_FORMAT の形に書き直す
  GET  /api/dev/tasks/{受付}?after=  ここまでの出来事と、終わったか(画面が 1 秒ごとに聞きに来る。中継の 524 を避けるため)
  GET  /api/dev/history         実行の履歴(server/devwork/history.jsonl。画面・AI・列を調べる、で流した SQL)
  POST /api/dev/bq/profile      列の中身を調べる(行数・空・値の種類・最小・最大・よく出る値)
  GET  /api/dev/files           作業ファイル(server/devwork/files/)  GET/PUT/DELETE /api/dev/files/{名前}  PUT …/pin  POST …/from-xlsx
  GET  /api/dev/chats           AI との会話の一覧   GET/PUT/DELETE /api/dev/chats/{id}  会話を開く・残す・消す(server/devwork/chats/)
  POST /api/dev/ai/context      Gemini に渡す前提を、そのまま返す(見る・コピーする)

中身は窓口のまとまりごとのモジュールに分けてある(2026-10-25 の整理 第 3 段):
  common      どの窓口も使う小道具(有効か・作業フォルダ DEVWORK・値の形・料金の目安・JSON のファイル・文書を文字にする)
  store       作業の設定・AI との会話・作業ファイル・実行の履歴(server/devwork/)
  bq_tools    BigQuery を見る・SQL を試す・流す・止める・列の中身を調べる
  ai_sql      Gemini と SQL を組み立てる(前提・道具・会話の 1 回分・使うモデル)
  work        出力ごとの版・採用・出す先・答え合わせ
  gcs_policy  ポリシーの文書(GCS を見る・文字にする・書き直す)
  tasks       時間のかかる処理を裏で走らせる(受付番号)
ルーターは、ここで 1 つにまとめる(/api/dev と、有効かの確かめを付ける)。
ほかのモジュール・テストが使う名前は、ここから、分ける前と同じ名前で見える。

決まり(DEVTOOLS.md の 6 章):
  - 環境変数 CCP_DEVTOOLS=1 のときだけ動く。それ以外は、画面(/dev/)も API も 404
  - BigQuery は読むだけ。dry-run で文の種類が SELECT のものだけを流す(DDL・DML・複数の文は流さない)
  - 読む量の上限は DEVTOOLS_MAX_GB(既定 10 GB)。超える問い合わせは BigQuery が止める
  - 作業ファイルは server/devwork/(Git に入れない。利用先の表の名前を含むため)。DB に置かないのは、import-pack で DB を置き換えても消えないように
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import bq
from . import ai_sql as _ai_sql, bq_tools as _bq_tools, gcs_policy as _gcs_policy, store as _store, tasks as _tasks_mod, work as _work
from .ai_sql import PRIVATE, ChatIn, ChatTurn, build_context, chapters, chat_events, default_model, parse_reply, pick_models, pro_of, run_tool, tool_declarations
from .bq_tools import CancelIn, ProfileIn, SqlIn, _running, cancel, dryrun, job_info, profile, profile_column, referenced, run, view_sources
from .common import (blocks, cost_usd, decode_text, enabled, flatten_fields, max_bytes, only_select, plain, price_per_tib, require_enabled,
                     weight, xlsx_text)
from .gcs_policy import ConvertIn, DocsIn, convert_events, gcs_extract, gcs_list, kind_of, parse_files
from .store import (ChatSaveIn, FileIn, PinIn, _chat_path, chats, delete_chat, delete_file, files, get_chat, pin_file, pinned_names, put_file,
                    read_history, read_work_file, record_run, save_chat, write_work_file)
from .tasks import CallIn, start_call, start_events, task_call, task_status
from .work import AdoptIn, CheckIn, VersionIn, _adopted_sql, adopt, check, check_output, get_version, save_version, work

router = APIRouter(prefix="/api/dev", dependencies=[Depends(require_enabled)])
# パスの形はモジュールの間で重ならないので、並べる順は結果を変えない
for _m in (_store, _bq_tools, _ai_sql, _work, _gcs_policy, _tasks_mod):
    router.include_router(_m.router)

# 分ける前と同じ名前で見せるもの(main・devimages・テストが使う。bq はテストが devtools.bq.client を差し替える)
__all__ = [
    "router", "bq",
    "PRIVATE", "ChatIn", "ChatTurn", "build_context", "chapters", "chat_events", "default_model", "parse_reply", "pick_models", "pro_of",
    "run_tool", "tool_declarations",
    "CancelIn", "ProfileIn", "SqlIn", "_running", "cancel", "dryrun", "job_info", "profile", "profile_column", "referenced", "run", "view_sources",
    "blocks", "cost_usd", "decode_text", "enabled", "flatten_fields", "max_bytes", "only_select", "plain", "price_per_tib", "require_enabled",
    "weight", "xlsx_text",
    "ConvertIn", "DocsIn", "convert_events", "gcs_extract", "gcs_list", "kind_of", "parse_files",
    "ChatSaveIn", "FileIn", "PinIn", "_chat_path", "chats", "delete_chat", "delete_file", "files", "get_chat", "pin_file", "pinned_names",
    "put_file", "read_history", "read_work_file", "record_run", "save_chat", "write_work_file",
    "CallIn", "start_call", "start_events", "task_call", "task_status",
    "AdoptIn", "CheckIn", "VersionIn", "_adopted_sql", "adopt", "check", "check_output", "get_version", "save_version", "work",
]
