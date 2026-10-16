# Vertex AI Workbench での CCP の構成

Campaign Contents Planner(CCP)を、Vertex AI Workbench のインスタンスの中で動かしている構成の説明。
**Workbench の中に、CCP のサーバーと PostgreSQL を立て(どちらも localhost)、画面は Jupyter の中継を通してブラウザで開く。**
手順そのもの(立ち上げ・更新・つまずき)は、[WORKBENCH.md](WORKBENCH.md)(移行の手順書)を参照。

---

## 1. 全体の構成

構成図の draw.io 版: [workbench-architecture.drawio](workbench-architecture.drawio)

```
 利用者のブラウザ
   │ https://<ノートブックの URL>/proxy/8081/   (Google のログインで守られている)
   ▼
┌──────────────── Vertex AI Workbench のインスタンス ────────────────┐
│                                                                      │
│  Jupyter の中継(/proxy/8081/)                                      │
│   │                                                                  │
│   ▼                                                                  │
│  CCP のサーバー(Python / FastAPI。uvicorn で localhost:8081)       │
│   ├ 画面(ビルドした HTML・JS)を配る                               │
│   ├ /api/data … データの読み書き ───▶ PostgreSQL(localhost:5432)   │
│   ├ /img      … 商品・メイン画像   ───▶ 画像のフォルダ(server/images)│
│   └ /api/ask  … AI ─────────────────────────────────────┐          │
│                                                          │          │
│  scripts/workbench.sh … 起動・停止・更新・取り込みをまとめて行う   │
│  server/workbench.env … 接続の設定(パスワードを含む。Git に入れない)│
└──────────────────────────────────────────────────────────┼──────────┘
                                                           ▼
                                   Vertex AI(Gemini)… Workbench のサービスアカウントで呼ぶ

 持ち込み:  コード … GitHub から git clone / git pull
            データと画像 … 「引っ越し用のパック」(ZIP)を、Jupyter からアップロードして取り込む
```

## 2. 構成要素

| 要素 | 中身 | 場所・ポート |
|---|---|---|
| 利用者のブラウザ | CCP の画面を開く。Workbench の Jupyter と同じ URL の下 | `https://<ノートブックの URL>/proxy/8081/`(末尾の `/` が必要) |
| Jupyter の中継 | Workbench に組み込みの仕組み。ブラウザからの通信を、インスタンスの中のポートに中継する。Google のログインで守られている | `/proxy/<ポート>/` |
| CCP のサーバー | Python(FastAPI)のアプリを、uvicorn で動かす。画面の配信・データの読み書き・画像の配信・AI の呼び出しを、1 つのプロセスで行う | `localhost:8081`(`CCP_PORT` で変えられる) |
| 画面 | React で作った画面を、あらかじめビルドしたもの(HTML・JS)。サーバーが配る。中継の下(`/proxy/8081/`)でも動くよう、API・画像のパスは、読み込んだ場所から求める | リポジトリの `dist-gcp/` |
| PostgreSQL | CCP のデータ(配信・商品・結果・メモ・履歴 など)。Workbench の中に conda で入れたもの | `localhost:5432` |
| 画像のフォルダ | 商品・メイン画像の写真。パックから展開したもの。サーバーが `/img/…` で配る(外部から直接は見えない) | `server/images/`(`ASSET_DIR`) |
| Vertex AI(Gemini) | AI の下書き・選定・振り返りなど。Workbench のサービスアカウントの権限で呼ぶ(鍵のファイルは使わない) | Google Cloud の API |
| 設定ファイル | DB の接続先(`DATABASE_URL`)、AI の設定、画像のフォルダ など | `server/workbench.env`(見本は `workbench.env.example`) |
| 操作のスクリプト | 起動・停止・状態の確認・更新・パックの取り込み・ログ | `scripts/workbench.sh` |

## 3. 安全のための約束

- 画面へのアクセスは、Jupyter の中継(Google のログイン)で守られる。CCP の画面のパスワード(`APP_PASSWORD`)は、設定しなくてもよい。
- DB のパスワードは `server/workbench.env` にだけ書く。このファイルと、展開した画像(`server/images/`)は、Git に入れない(除外の設定済み)。
- AI は、Workbench のサービスアカウントの権限(「Vertex AI ユーザー」)で呼ぶ。鍵のファイルは置かない。
- Workbench の中では、コードを変えて Git に送らない(コードの変更は `update` で取り込む)。
