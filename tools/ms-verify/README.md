# ms-verify(Copilot Studio を CCP から呼ぶ検証の道具)

CCP の頼み T1〜T6 を、Copilot Studio のエージェントに送って、速さと答えの形を測る。**検証の道具で、CCP の画面・サーバーには入れない。** 手順・結果・エージェントの作り方は [docs/MS_AI_VERIFY.md](../../docs/MS_AI_VERIFY.md)(12.4 にこの道具の使い方)。

## 使い方

Node 22 以上が要る。

```powershell
cd tools\ms-verify
npm install
node measure.mjs --self-test                                  # つながずに、確かめの仕組みだけを試す
node measure.mjs --via dl --runs 1                            # 方式 1(Direct Line)で T1〜T5 を 1 回ずつ
node measure.mjs --via dl --only T6 --image images\t6-sample.png   # T6 を、画像を付けて送る
node measure.mjs --runs 1                                     # 方式 2(Agents SDK)。最初の 1 回だけブラウザが開く(人がサインイン)
node check-token-endpoint.mjs                                 # 鍵なしの入口で断られるか
```

## 設定は、リポジトリの外に置く

鍵・環境の ID などは、このフォルダにも Git にも置かない。`%USERPROFILE%\.ccp\ms-verify.env` に書く(書き方は docs/MS_AI_VERIFY.md の 12.4)。

| できるファイル | 中身 | Git |
|---|---|---|
| `.token-cache.json` | 方式 2 のサインインのトークン | 入れない(.gitignore) |
| `results/` | 測った表と答えの全文 | 入れない(.gitignore) |
| `node_modules/` | 部品 | 入れない |

## ファイル

| ファイル | 中身 |
|---|---|
| `measure.mjs` | 送って測る本体 |
| `tests.mjs` | T1〜T6 の頼みと、決まりの確かめ(docs/MS_AI_VERIFY.md の 7 章と同じ中身。直すときは両方) |
| `check-token-endpoint.mjs` | 鍵を必須にしたエージェントが、鍵なしの入口を断るかを確かめる |
| `make-sample-image.mjs` | T6 の見本の図を描く |
| `images/t6-sample.png` | T6 の見本の図(緑の長袖のセーター)。**写真ではなく、`make-sample-image.mjs` で塗った図**なので、権利の心配がない(リポジトリには商品の写真がないため、描いて用意した)。本番に近い写真で試すときは、自分で撮った写真などを、このフォルダの外に置いて `--image` で渡す |

## ZIP にして渡す

```powershell
npm run pack:ms-verify    # リポジトリの最上位で。release-out/ccp-ms-verify-<日付>-<コミット>.zip
```

ZIP には、このフォルダ(部品・設定・トークン・結果を除く)と docs/MS_AI_VERIFY.md の写しが入る。受け取った人は、ZIP を展開して `npm install` から始める。
