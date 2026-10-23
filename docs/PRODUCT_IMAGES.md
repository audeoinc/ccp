# 手順: 商品ページの画像を、Workbench の CCP に取り込む

商品を選ぶときの画像の候補にするため、商品ページに載っている画像(メインを含む)を、商品の画像の表(`product_images`)に取り込みます。
「商品ページから画像を選ぶ」と、AI が配信に合う画像を勧める仕組みが、この画像を候補に使います。

- 状態: 2026-10-23 に作った(バックログ B11)。**まとめてダウンロードするスクリプトと、この手順書は、当面 Workbench 版の ZIP に入れない**(利用者の指示 2026-10-23。取り込み・画像を選ぶ窓は入る)。手元の PC で集める → ZIP を Workbench に運ぶ → Workbench で取り込む
- Workbench のサーバーは、利用先の EC サイトを読めません。そのため、ページを読める**手元の PC**で集めます
- 商品ページの URL の決まり・画像の見分け方は、このリポジトリに書きません(CSV と、スクリプトの引数にだけ持つ)

---

## 0. 取り込んだ画像の使われ方

- 配信カードの商品の「この配信で使う画像」の窓を開くと、取り込んだ画像(メインに印)が候補に並びます(ページを読みに行かない)。「ページを読む」で、ページの画像に替えることもできます
- 「AI に選んでもらう」で、AI が画像ごとのアングルを見分け、配信のテーマ・見出し・コピーに合う画像を勧めます。画像は、このサーバーの置き場所から読むので、Workbench でも動きます

## 1. 手元の PC で集める

Python 3(標準の機能だけ。追加のインストールは要りません)で、リポジトリの `scripts/collect-product-images.py` を実行します。

**CSV を用意する**(1 行目は列名。UTF-8 か Shift_JIS):

| 列 | 必須 | 中身 |
|---|---|---|
| `product_code` | ○ | 商品コード(CCP の商品のマスタと同じ) |
| `page_url` | ○ | 商品ページの URL |
| `main_image_url` | | メイン画像の URL(商品のマスタにあるもの)。あれば先頭に「メイン」の印を付けて集め、ページ上の同じ画像は重ねて集めない |
| `market` | | 市場(`JP` など)。なければ、同じ商品コードのすべての市場の商品につなぐ |

CSV は、開発用の画面(`/dev/`)の SQL のコンソールで、BigQuery の商品のマスタから作ると楽です(結果を「TSV でコピー」して、表計算で CSV に保存する、など)。

**実行する**:

```bash
python scripts/collect-product-images.py 商品.csv --limit 5
```

まず `--limit 5` で数件だけ試し、`product_images_out/` の画像と、表示される「飛ばした」理由を見て、引数を決めます。

| 引数 | 既定 | 中身 |
|---|---|---|
| `--include <正規表現>` | | この形の URL の画像だけを集める(例: 商品画像のフォルダ) |
| `--exclude <正規表現>` | | この形の URL の画像は集めない(例: サムネイル・関連商品) |
| `--max-per-product` | 30 | 1 商品あたりの上限(メインは数えない) |
| `--min-bytes` | 8000 | これより小さい画像は集めない(飾りを除くため) |
| `--sleep` | 1 | 1 回読むごとに待つ秒(相手のサイトに負担をかけない) |
| `--out` | `product_images_out` | 集めた画像を置くフォルダ |
| `--zip` | `product_images_<日時>.zip` | 作る ZIP |
| `--retry-errors` | | 前に読めなかった商品も、もう一度読む |

- 途中で止めても、同じコマンドをもう一度流せば、済んだ商品を飛ばして続きから集めます(`product_images_out/results.jsonl` に記録)
- 拾い方は、CCP の「商品ページから画像を選ぶ」と同じです(`<img>` の src・data-src・srcset のいちばん大きいもの、og:image。ロゴ・アイコンなどの小さな飾りは除く)
- **画像ごとの説明(description)も取ります**(利用者の依頼 2026-10-23)。`alt` → `title` → 画像が入っている `<figure>` の `<figcaption>` → JSON-LD(`application/ld+json` の `ImageObject` の `caption` / `description` / `name`。URL で画像に当てる)の、最初にあるものを、目録の `caption` に入れます。取り込むと `product_images.caption`(1 枚ごと)に、メイン画像を設定するときは商品のマスタの `products.image_caption` にも入ります。見本の EC サイトのページも、同じ書き方(alt・figcaption・JSON-LD)で説明を出しています
- 画像の URL の大きさの指定 `?width=…`(大文字・小文字は問わない)は外して、元の大きさで取ります(2026-10-23)。ほかのクエリ(`w=`・`height=` なども)はそのまま残します
- 最後に、画像と目録(`manifest.json`。商品・元の URL・メインかどうか・読めなかったページと理由)を 1 つの ZIP にまとめます

## 2. ZIP を Workbench に運ぶ

引っ越し用のパックと同じように、Jupyter の画面からアップロードします(大きいときは GCS 経由で)。

## 3. Workbench で取り込む

```bash
cd ~/ccp/server
.venv/bin/python -m ccp.cli import-images ~/product_images_20261023_1500.zip          # 中身を見るだけ
.venv/bin/python -m ccp.cli import-images ~/product_images_20261023_1500.zip --yes    # 取り込む
```

- 画像は `server/images/products/` に置きます(`--images` で変えられる。サーバーの `ASSET_DIR` と同じフォルダに)。Git に入らないので、コードを更新しても消えません
- 表 `product_images` の、ZIP に入っている商品の行は入れ替わります(何度流しても同じ結果)。同じ画像のファイルは 1 つだけ置きます
- 商品のマスタのメイン画像(`image_url`)は、空のときだけ、取り込んだメイン画像で埋めます。置き換えるときは `--main-to-master`
- マスタにない商品・配れない種類の画像(GIF・AVIF)は飛ばして、件数を出します
- **引っ越し用のパックで DB を置き換えた(`import-pack --yes`)あとは、表 `product_images` の行が消えます。** 画像のファイルは残るので、同じ ZIP をもう一度取り込んでください

## 4. 見本の写真(AI で作る。B12)

見本のデータの商品に、EC の商品写真のような写真(メイン + 素材・ディテール・着用などのサブ)と、その説明の文を持たせます。見本の商品ページ(`/sample-shop/p/<商品コード>`)が、本物の商品ページのように見え、ここまでの「取り込んだ画像」と同じ道で使われます。

- 作る(開発側の手元の PC。この PC の認証で Vertex AI の画像のモデルを呼ぶ。1 枚ごとに費用がかかる): `python scripts/sample-photos.py generate`。何を作るかは `scripts/sample-photos.json`(先頭がメイン。サブはメインを手本に作る)。写真は `import/sample-photos/`(Git に入れない)
- ZIP にする: `python scripts/sample-photos.py zip`(25MB ごとに分ける)。目録に `"sample": true`
- 取り込む: 上の 3 章と同じ `ccp.cli import-images`、または画面の ⚙ →「見本のデータ」→「商品・メイン画像の写真の ZIP を取り込む」(確認のあとで取り込む)
- 表 `product_images` の `source = sample` の行になり、`alt` が見出し・`caption` が説明の文(メインの写真にも。メインの説明がない下書きには `python scripts/sample-photos.py fill-main --spec …` で AI が足す)・`angle` がアングル。見本の ZIP は見本の行だけを、本物の ZIP は本物の行だけを入れ替えます。本物の画像がある商品では、画面は本物を使います
- 商品のメイン画像(マスタ)は、空か仮の画像(placehold.co)のときだけ、見本のメインで置き換えます。⚙ で「メイン画像も置き換える」(OK)を選ぶか、`--main-to-master` を付けると、今のメイン画像も置き換えます。前の画像は `source = master` の行に控えとして 1 度だけ残すので、元に戻せます(その行の `image_url` を商品の `image_url` に戻す)。控えの行は、画像を選ぶ窓の候補には出ません
- **メイン画像(ヒーロー。表 `hero_images`)の見本の写真**: `python scripts/sample-photos.py draft-heroes --products <商品の一覧の JSON> --spec import/heroes.json`(名前・説明・季節から、新しい写真の注文の文を AI が下書き。人は顔が写らない構図だけ)→ `generate --spec import/heroes.json --out import/hero-photos`(横長 4:3 を 1 枚、長い辺 1600px。テンプレートごとに切り出すので、主役を真ん中に)→ `zip` も同じ指定で。目録に `"kind": "heroes"` が入り、上と同じ入口(`import-images`・⚙)で取り込めます。行は `id`(なければ画像コードと市場)で探し、`image_url` を `/img/heroes/s-<sha256 の頭>.jpg` に差し替え、前の画像は `original_image_url` に 1 度だけ控えます(ファイルは消さない。元に戻すときは、それを `image_url` に戻す)。焦点(`focal_*`)は空に戻ります
