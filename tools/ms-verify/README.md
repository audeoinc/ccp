# ms-verify(Copilot Studio を CCP から呼ぶ検証の道具)

CCP の頼み T1〜T6 を、Copilot Studio のエージェントに送って、速さと答えの形を測る。**検証の道具で、CCP の画面・サーバーには入れない。** 手順・結果・エージェントの作り方は `docs/MS_AI_VERIFY.md`(12.4 にこの道具の使い方)。リポジトリでは最上位の `docs/` に、ZIP では同じフォルダの `docs/` に入っている。

## 使い方

Node 22 以上が要る。

```powershell
cd tools\ms-verify
npm install
node measure.mjs --self-test                                  # つながずに、確かめの仕組みだけを試す
node measure.mjs --via dl --runs 1                            # 方式 1(Direct Line)で T1〜T5 を 1 回ずつ
node measure.mjs --via dl --only T6 --image images\<写真>.jpg  # T6 を、画像を付けて送る(写真は下の「T6 の写真」)
node measure.mjs --runs 1                                     # 方式 2(Agents SDK)。最初の 1 回だけブラウザが開く(人がサインイン)
node check-token-endpoint.mjs                                 # 鍵なしの入口で断られるか
```

## T6 の写真

**T6 の写真は、各自で用意する**(リポジトリ・ZIP には入れない)。

- 服の写真を 1 枚、このフォルダの `images/` に置いて `--image` で渡す(`images/` は .gitignore で Git に入らない)。
- 人の顔・社外秘の写る写真は使わない。形は png・jpeg・webp。
- 方式やモデルを比べるときは、同じ写真を使う。どの写真で試したか(何が写っているか・大きさ)を、記録に書く。

## 設定は、リポジトリの外に置く

鍵・環境の ID などは、このフォルダにも Git にも置かない。`%USERPROFILE%\.ccp\ms-verify.env` に書く(書き方は docs/MS_AI_VERIFY.md の 12.4)。

| できるファイル | 中身 | Git |
|---|---|---|
| `.token-cache.json` | 方式 2 のサインインのトークン | 入れない(.gitignore) |
| `results/` | 測った表と答えの全文 | 入れない(.gitignore) |
| `images/` | T6 の写真(各自で用意) | 入れない(.gitignore) |
| `node_modules/` | 部品 | 入れない |

## ファイル

| ファイル | 中身 |
|---|---|
| `measure.mjs` | 送って測る本体 |
| `tests.mjs` | T1〜T6 の頼みと、決まりの確かめ(docs/MS_AI_VERIFY.md の 7 章と同じ中身。直すときは両方) |
| `check-token-endpoint.mjs` | 鍵を必須にしたエージェントが、鍵なしの入口を断るかを確かめる |

## ZIP にして渡す

```powershell
npm run pack:ms-verify    # リポジトリの最上位で。release-out/ccp-ms-verify-<日付>-<コミット>.zip
```

ZIP には、このフォルダ(部品・設定・トークン・結果・写真を除く)と docs/MS_AI_VERIFY.md の写しが入る。受け取った人は、ZIP を展開して `npm install` から始める。
