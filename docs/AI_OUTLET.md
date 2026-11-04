# AI の出口(AI_OUTLET_URL)— ほかの AI を使うときの設定と、層との約束(版 1)

CCP は、ふだん Google の Gemini(Vertex AI)を使います。**使う組織の都合でほかの AI を使いたいときは、CCP の外に「層」を置き、CCP の AI をすべてその層に頼む**ことができます。この文書は、その設定と、層が守る約束です。考え方と経緯は [AI_OUTLET_PLAN.md](AI_OUTLET_PLAN.md)。Microsoft の Copilot Studio(Direct Line)・AI Builder につなぐ層の作り方と、検証の結果は [MS_AI_SETUP.md](MS_AI_SETUP.md)(0 章に、作るものの一覧)。

```
  画面 ──► CCP のサーバー
               │  AI が要る所(4 か所)
               ▼
         ┌ AI_OUTLET_URL が空     ──► Gemini(いまどおり)
         └ AI_OUTLET_URL が入っている ──► 層(CCP のフォルダの外) ──► 使いたい AI
```

## 1. 設定

出口の URL・待ち時間・同時の上限は、⚙ →「AI の設定」(管理する人だけ)で入れます(DB に持つ。2026-11-03 から。前の版で環境変数に書いてあれば、サーバーを起動したときに一度だけ DB に写します)。合言葉は秘密なので、環境変数のままです。

| 項目(前の版の環境変数) | 中身 | 空のとき |
|---|---|---|
| 出口の URL(`AI_OUTLET_URL`) | 層の窓口の URL(例: 同じマシンの `http://127.0.0.1:8090/ask`) | Gemini を使う |
| `AI_OUTLET_TOKEN`(環境変数) | 層に送る合言葉(`Authorization: Bearer <合言葉>`)。層は、これがない呼び出しを断る | 送らない |
| 待ち時間(`AI_OUTLET_TIMEOUT`) | 1 回の待ち時間(秒) | 120 |
| 同時の上限(`GEMINI_CONCURRENCY`) | AI を同時に呼ぶ数の上限。層を使うときも効く | 4 |

- **Gemini に戻すときは、⚙ →「AI の設定」で出口の URL を空にして保存します。** 起動し直さずに、次の呼び出しから効きます。変えられるのは管理する人だけで、だれが・いつ変えたかが残ります(使っているうちに AI が変わると、使う人が混乱するため、変えたら知らせてください)。
- 層が失敗しても、**自動で Gemini には回しません**。画面にエラーを出します(どちらの AI が書いたか分からなくなるのと、Google にデータを出したくない場合に困るため)。
- 設定を確かめるときは `python -m ccp.cli check`。「■ AI」の段に、出口の URL に届くかが出ます(つなぐだけで、AI は呼びません。合言葉は「あり / なし」だけを出します)。
- 開発用の画面(`/dev/`)の AI は、出口を通さず、Gemini のままです。

## 2. 層との約束(版 1)

### CCP から層へ

`POST <AI_OUTLET_URL>`、`Content-Type: application/json`、合言葉があれば `Authorization: Bearer <AI_OUTLET_TOKEN>`

```json
{
  "version": 1,
  "purpose": "ask",
  "parts": [
    { "text": "…指示文…" },
    { "image": { "mime_type": "image/jpeg", "data": "<base64>" } }
  ],
  "response_format": "json",
  "effort": "low"
}
```

| 項目 | 中身 |
|---|---|
| `version` | 約束の版。いまは 1 |
| `purpose` | 使う所(下の表)。層が、所ごとにモデルや待ち時間を分けたいときに使う。分けなくてもよい |
| `parts` | 並んだ順に AI に渡す。文だけのときは 1 つ。画像は JPEG・PNG・WebP |
| `response_format` | いまは常に `json`。**答えは JSON の文だけ**にする(説明の文や囲みを付けない)。指示文でも JSON を求めている |
| `effort` | 考える深さの目安(`minimal` / `low` / `medium` / `high`)。`ask` のときだけ付く(CCP の `GEMINI_THINKING`、既定 `low`)。層は無視してもよい |

| `purpose` | 所 | 送るもの |
|---|---|---|
| `ask` | 文章の下書き・言い換え・商品の選定など | 指示文だけ |
| `hero_describe` | メイン画像の説明の下書き | 画像 1 枚 + 指示文 |
| `part_describe` | 部品の画像(ボタン・バナーなど)の説明の下書き | 画像 1 枚 + 指示文 |
| `product_image_suggest` | 商品ページの画像の提案 | 指示文・配信と商品の情報・画像ごとの見出しと画像(いくつか) |

### 層から CCP へ

| 結果 | 返すもの |
|---|---|
| 成功 | `200`、`{"text": "<AI の答え(JSON の文)>"}` |
| 失敗 | `200` 以外、`{"error": {"message": "<使う人に見せてよい理由>"}}`。混み合いは `429` にすると、画面に「混み合っています」と出る |
| 答えが空 | 失敗として返す |

- CCP は、層が返したものの `text` だけを読みます。
- 約束を変えるときは `version` を上げ、この文書と、リリースの知らせに書きます。

## 3. 見本の層(`tools/ai-outlet/sample_layer.py`)

受けた依頼を、そのまま Gemini に回して答えを返すだけの層です。**使いたい AI につなぐ層を作るときの出発点**にしてください(関数 `gemini()` を、使いたい AI を呼ぶ形に書き換える)。CCP のサーバーと同じ Python で動き、足すライブラリはありません。

1. `tools/ai-outlet/sample_layer.py` を、**CCP のフォルダの外**に写します(CCP を新しい版に入れ替えても、層が消えないように)。
2. 層を起動します(同じマシンの中だけで待ちます)。
   ```bash
   GOOGLE_CLOUD_PROJECT=<プロジェクト> AI_OUTLET_TOKEN=<合言葉> python sample_layer.py --port 8090
   ```
3. CCP のサーバーの設定(環境変数)に `AI_OUTLET_TOKEN=<同じ合言葉>` を足して起動し直し、⚙ →「AI の設定」の出口の URL に `http://127.0.0.1:8090/ask` を入れて保存します。
4. `python -m ccp.cli check` で、「AI の出口 … に届きます」と出るのを確かめます。

## 4. 層を作るときに気をつけること

- **1 回の「AI で下書き」で、AI を 6〜9 回呼びます。** 1 回の答えが遅い AI やつなぎ方だと、全体が遅く感じます。API で直接呼べる AI のモデルが向いています。
- **画像を読める AI** を選んでください(`hero_describe`・`part_describe`・`product_image_suggest`)。読めない AI にする場合は、層がその 3 つの `purpose` だけをほかの AI に回す、という分け方もできます。
- **答えを JSON の形で正しく返せること**が大事です。AI に「JSON だけで返す」設定があれば使ってください。
- 指示文は日本語です。画面が English のときは、英語に言い換えた指示文が届きます。どちらも同じように扱えば大丈夫です。
- 層は、外から呼べないようにしてください(同じマシンの中だけで待つ、か、合言葉を確かめる)。
- 層のログに、指示文や画像の中身を残さないでください(配信の中身が入っています)。
