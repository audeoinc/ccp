#!/usr/bin/env bash
# Vertex AI Workbench で CCP を動かすためのスクリプト(手順の詳細は docs/WORKBENCH.md)。
#
#   scripts/workbench.sh setup          初回の準備(Python の環境・パッケージ・画面のビルド・設定ファイルの用意)
#   scripts/workbench.sh update         コードを最新にして(git pull → ビルド)、サーバーを起動し直す ← いちばんよく使う
#   scripts/workbench.sh start          サーバーを起動する(裏で動かし続ける。ターミナルを閉じても止まらない)
#   scripts/workbench.sh stop           サーバーを止める
#   scripts/workbench.sh restart        サーバーを起動し直す
#   scripts/workbench.sh status         サーバーと PostgreSQL が動いているか
#   scripts/workbench.sh check          設定・DB への接続・写真・画面のビルドを確かめる(python -m ccp.cli check)
#   scripts/workbench.sh import <ZIP>   引っ越し用のパックを取り込む(中身を見せて、確認してから。DB の中身は置き換わる)
#   scripts/workbench.sh log            サーバーのログの最後を見る
#
# 設定は server/workbench.env から、毎回読み込む(見本は server/workbench.env.example)。
# ポートは CCP_PORT(既定 8081)。画面は https://<ノートブックの URL>/proxy/<ポート>/ で開く(末尾の / を付ける)。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/server"
PY="${CCP_PYTHON:-$SERVER/.venv/bin/python}"  # Python の場所(既定は server/.venv。別の Python を使うときは CCP_PYTHON で指定)
ENV_FILE="$SERVER/workbench.env"
PID_FILE="$SERVER/.ccp-server.pid"
LOG_FILE="$SERVER/ccp-server.log"
PORT="${CCP_PORT:-8081}"

say() { printf '\n== %s\n' "$*"; }
die() { printf '\n[エラー] %s\n' "$*" >&2; exit 1; }

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  else
    echo "(server/workbench.env がありません。環境変数は、いまのシェルのものを使います)"
  fi
  # 写真のフォルダ: 設定がなく、パックを展開したフォルダがあれば、それを使う
  if [ -z "${ASSET_DIR:-}" ] && [ -d "$SERVER/images" ]; then
    export ASSET_DIR="$SERVER/images"
  fi
}

need_venv() {
  [ -x "$PY" ] || die "Python の環境がありません。先に scripts/workbench.sh setup を実行してください"
}

server_pid() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    cat "$PID_FILE"
  else
    # 前の起動の記録がないときは、動いているサーバーを探す(pgrep がない環境では、探さない)
    if command -v pgrep > /dev/null; then pgrep -f "uvicorn ccp.main:app --port $PORT" | head -n 1 || true; fi
  fi
}

build() {
  say "画面のパッケージを入れる(npm ci)"
  (cd "$ROOT" && npm ci)
  say "画面をビルドする(npm run build)"
  (cd "$ROOT" && npm run build)
}

pip_install() {
  # requirements.txt が変わったときだけ入れ直す(前回の中身の記録と比べる)
  local stamp="$SERVER/.venv/.requirements.sha"
  local now
  now="$(sha256sum "$SERVER/requirements.txt" | cut -d' ' -f1)"
  if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$now" ]; then
    say "サーバーのパッケージを入れる(pip install)"
    "$PY" -m pip install -r "$SERVER/requirements.txt"
    echo "$now" > "$stamp"
  else
    echo "(サーバーのパッケージは変わっていないので、入れ直しません)"
  fi
}

cmd_setup() {
  say "Python の環境を作る(server/.venv)"
  if [ ! -x "$PY" ]; then
    (cd "$SERVER" && python3 -m venv .venv)
  else
    echo "(すでにあります)"
  fi
  pip_install
  build
  if [ ! -f "$ENV_FILE" ]; then
    cp "$SERVER/workbench.env.example" "$ENV_FILE"
    say "設定ファイルを用意しました: server/workbench.env"
    echo "  <…> の部分を、この環境の値に書き換えてください(DB・AI を設定済みなら、その行は # でコメントアウト)。"
    echo "  書き換えたら: scripts/workbench.sh check → scripts/workbench.sh start"
  else
    echo "(server/workbench.env は、すでにあります)"
    echo "次は: scripts/workbench.sh check → scripts/workbench.sh start"
  fi
}

cmd_check() {
  need_venv
  load_env
  (cd "$SERVER" && "$PY" -m ccp.cli check)
}

cmd_start() {
  need_venv
  local pid
  pid="$(server_pid)"
  if [ -n "$pid" ]; then
    echo "サーバーは、すでに動いています(pid $pid、ポート $PORT)。起動し直すときは: scripts/workbench.sh restart"
    return 0
  fi
  load_env
  [ -f "$ROOT/dist-gcp/index.html" ] || die "画面のビルドがありません。scripts/workbench.sh update(または setup)を実行してください"
  say "サーバーを起動する(ポート $PORT)"
  (cd "$SERVER" && nohup "$PY" -m uvicorn ccp.main:app --port "$PORT" < /dev/null > "$LOG_FILE" 2>&1 & echo $! > "$PID_FILE")
  # 起動を待つ(最大 30 秒)
  for _ in $(seq 1 30); do
    if curl -s -o /dev/null "http://127.0.0.1:$PORT/ping"; then
      echo "起動しました(pid $(cat "$PID_FILE"))。"
      echo "  画面: https://<ノートブックの URL>/proxy/$PORT/   ← 末尾の / を付ける"
      echo "  ログ: scripts/workbench.sh log"
      return 0
    fi
    sleep 1
  done
  echo "--- ログの最後"
  tail -n 30 "$LOG_FILE" || true
  die "30 秒たっても起動しませんでした。上のログと、scripts/workbench.sh check を確かめてください"
}

cmd_stop() {
  local pid
  pid="$(server_pid)"
  if [ -z "$pid" ]; then
    echo "サーバーは動いていません"
  else
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    echo "サーバーを止めました(pid $pid)"
  fi
  rm -f "$PID_FILE"
  # 念のため: まだ応答があれば、名前で探して止める
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/ping" && command -v pkill > /dev/null; then
    pkill -f "uvicorn ccp.main:app --port $PORT" || true
    sleep 1
  fi
}

cmd_status() {
  local pid
  pid="$(server_pid)"
  if [ -n "$pid" ] && curl -s -o /dev/null "http://127.0.0.1:$PORT/ping"; then
    echo "サーバー: 動いています(pid $pid、ポート $PORT)"
  else
    echo "サーバー: 止まっています(起動: scripts/workbench.sh start)"
  fi
  if command -v pg_isready > /dev/null; then
    printf 'PostgreSQL: '
    pg_isready -h localhost -p 5432 || true
  else
    echo "PostgreSQL: (pg_isready が見つかりません。conda の環境を有効にしたターミナルで確かめてください)"
  fi
  (cd "$ROOT" && echo "コード: $(git log --oneline -1)")
}

cmd_update() {
  need_venv
  say "コードを最新にする(git pull)"
  (cd "$ROOT" && git pull --ff-only)
  pip_install
  build
  cmd_stop
  cmd_start
}

cmd_import() {
  local zip="${1:-}"
  [ -n "$zip" ] || die "取り込むパック(ZIP)を指定してください。例: scripts/workbench.sh import server/ccp-pack-20261015-0938.zip"
  [ -f "$zip" ] || die "ファイルが見つかりません: $zip"
  need_venv
  load_env
  zip="$(cd "$(dirname "$zip")" && pwd)/$(basename "$zip")"
  say "パックの中身"
  (cd "$SERVER" && "$PY" -m ccp.cli import-pack "$zip")
  printf '\nこの環境の DB の中身を、このパックの内容に置き換えます(いまの中身は消えます)。よろしいですか? [y/N] '
  read -r ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "やめました(何も変えていません)"; return 0; }
  # 写真は、ASSET_DIR(設定があれば)か、server/images に展開する(サーバーは、そこから配る)
  local images="${ASSET_DIR:-$SERVER/images}"
  (cd "$SERVER" && "$PY" -m ccp.cli import-pack "$zip" --yes --images "$images")
  export ASSET_DIR="$images"
  cmd_stop
  cmd_start
}

cmd_log() {
  [ -f "$LOG_FILE" ] && tail -n "${2:-50}" "$LOG_FILE" || echo "ログはまだありません"
}

case "${1:-}" in
  setup) cmd_setup ;;
  update) cmd_update ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_stop; cmd_start ;;
  status) cmd_status ;;
  check) cmd_check ;;
  import) cmd_import "${2:-}" ;;
  log) cmd_log "$@" ;;
  *)
    sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
