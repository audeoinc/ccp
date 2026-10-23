# Vertex AI Workbench での CCP の構成

Campaign Contents Planner(CCP)を、Vertex AI Workbench のインスタンスの中で動かしている構成の説明。
**Workbench の中に、CCP のサーバーと PostgreSQL を立て(どちらも localhost)、画面は Jupyter の中継を通してブラウザで開く。**
手順そのもの(立ち上げ・更新・つまずき)は、[WORKBENCH.md](WORKBENCH.md)(移行の手順書)を参照。

---

## 1. 全体の構成

構成図の draw.io 版: [workbench-architecture.drawio](workbench-architecture.drawio)

```
┌─ 利用者のブラウザ ─────────────────────────┐
│ 画面(HTML・JS)… サーバーから受け取り、表示する │
│ JS(React)  … 操作に応じて API を呼ぶ(fetch)、 │
│                返ってきた JSON で画面を書き換える │
└──────────────┬─────────────────────────────┘
               │ ① 画面を読み込む / ② API を呼ぶ(HTTPS。Google のログインで守られる)
               ▼
┌──────────────── Vertex AI Workbench のインスタンス ─────────────────────────┐
│ Jupyter の中継 … /proxy/8082/ を、インスタンスの中の localhost:8082 に中継する │
│   │ ③ HTTP                                                                   │
│   ▼                                                                          │
│ ┌ uvicorn(Web サーバー)… localhost:8082 で HTTP を待ち受け、FastAPI に渡す ┐ │
│ │ ┌ FastAPI(アプリの本体。Python)… URL ごとに処理を振り分ける ───────┐ │ │
│ │ │ /          … 画面の HTML・JS を返す                                   │ │ │
│ │ │ /api/data  … データの読み書き ◀── ⑤ SQL ──▶ PostgreSQL(データベース)│ │ │
│ │ │ /img       … 商品・メイン画像を返す ◀── 画像のフォルダ                │ │ │
│ │ │ /api/ask   … AI に依頼 ◀── HTTPS ──▶ Vertex AI(Gemini)※インスタンスの外│ │ │
│ │ └────────────────────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────────────┘ │
│ PostgreSQL(localhost:5432)… データを保存・検索する                          │
└──────────────────────────────────────────────────────────────────────────────┘

 1 回の操作の流れ
 ① ブラウザが画面(HTML・JS)を読み込む
 ② 画面を操作すると、JS がサーバーの API を呼ぶ(例: /api/data)
 ③ Jupyter の中継が、uvicorn に届ける
 ④ uvicorn が FastAPI に渡し、FastAPI が URL に合う処理を動かす
 ⑤ FastAPI が PostgreSQL に SQL で読み書きする(AI のときは Vertex AI に依頼する)
 ⑥ 結果を JSON で返し、JS が画面を書き換える
```

## 2. 構成要素

| 要素 | 中身 | 場所・ポート |
|---|---|---|
| 利用者のブラウザ | CCP の画面を開く。Workbench の Jupyter と同じ URL の下 | `https://<ノートブックの URL>/proxy/8082/`(末尾の `/` が必要) |
| Jupyter の中継 | Workbench に組み込みの仕組み。ブラウザからの通信を、インスタンスの中のポートに中継する。Google のログインで守られている | `/proxy/<ポート>/` |
| uvicorn | Web サーバー。`localhost:8082` で HTTP の依頼を待ち受け、FastAPI に渡し、返事を送り返す | `localhost:8082`(`CCP_PORT` で変えられる) |
| FastAPI | CCP のサーバーのアプリの本体(Python)。URL ごとに処理を振り分ける: `/`(画面の HTML・JS)、`/api/data`(データの読み書き)、`/api/approvals`・`/api/production`(承認・制作の依頼を進める)、`/api/bq`・`/api/metrics`・`/api/policies`(取り込み)、`/img`(画像)、`/api/ask`(AI)。結果は JSON で返す | uvicorn の中で動く |
| 画面(HTML・JS) | React で作った画面を、あらかじめビルドしたもの。FastAPI が配り、ブラウザで動く。JS が、操作に応じて `/api/data`・`/api/ask` などを呼び(fetch)、返ってきた JSON で画面を書き換える。中継の下(`/proxy/8082/`)でも動くよう、API・画像のパスは、読み込んだ場所から求める | `dist-gcp/` |
| PostgreSQL | データベース。CCP のデータ(配信・商品・結果・メモ・履歴 など)を保存・検索する。FastAPI だけが、SQL で読み書きする(ブラウザから直接はつながらない)。Workbench の中に conda で入れたもの | `localhost:5432` |
| 画像のフォルダ | 商品・メイン画像の写真。サーバーが `/img/…` で配る(外部から直接は見えない) | `server/images/`(`ASSET_DIR`) |
| Vertex AI(Gemini) | AI の下書き・選定・振り返りなど。Workbench のサービスアカウントの権限で呼ぶ(鍵のファイルは使わない) | Google Cloud の API |
| 設定ファイル | DB の接続先(`DATABASE_URL`)、AI の設定、画像のフォルダ など | `server/workbench.env`(見本は `workbench.env.example`) |
| 操作のスクリプト | 起動(止まっていれば PostgreSQL も)・停止・状態の確認・ログ | `scripts/workbench.sh` |

## 3. 安全のための約束

- 画面へのアクセスは、Jupyter の中継(Google のログイン)で守られる。CCP の画面のパスワード(`APP_PASSWORD`)は、設定しなくてもよい。
- DB のパスワードは `server/workbench.env` にだけ書く。
- AI は、Workbench のサービスアカウントの権限(「Vertex AI ユーザー」)で呼ぶ。鍵のファイルは置かない。
