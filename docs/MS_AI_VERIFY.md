# Microsoft の AI(Copilot Studio)を CCP から呼ぶ検証の手順

2026-10-29 作成。検証が進むたびに足す。CCP の AI を外の層に頼む作りは [AI_OUTLET_PLAN.md](AI_OUTLET_PLAN.md)、Gemini と Microsoft の候補の比較は [AI_PLATFORMS.md](AI_PLATFORMS.md)。

Copilot Studio の画面の名前(6・8 章のメニューの場所など)は、画面の版で変わることがある。**「(未確認)」の印がある所は、実際の画面でまだ確かめていない。**確かめたら印を消す。

この文書には、テナント・環境の名前、環境の ID・URL、メールアドレス、鍵を書かない。`<環境の ID>` のように置き換えて書く。

## 0. 守ること

- **サインインは人が行う。** Claude はパスワードを入れない。`pac auth create` でブラウザが開いたら、人に頼む。
- **環境にものを作るのは、人の指示があってから。** どの環境に何を作るかを、先に人に確かめる。
- **消すのは人。** Claude は、エージェントや環境を消さない。消し方を伝えて、人に消してもらう。
- 調べるだけのコマンド(`pac env list` など)は、確かめなしで行ってよい。
- **鍵(Direct Line の秘密)は、リポジトリの外に置く。** サーバーの設定(環境変数)か、リポジトリの外のファイル。コミット・チャット・文書に書かない。

## 1. 用意するもの

| もの | 中身 |
|---|---|
| Microsoft のアカウント | Copilot Studio を使えるもの。サインインは人が行う |
| Power Platform の Developer の環境 | 個人の検証用の環境。会社全体の既定の環境(Default)は使わない |
| Windows の PC | winget が使えるもの |
| CCP の開発の環境 | サーバーを手元で動かせるもの(3 章以降で CCP から呼ぶとき) |

## 2. Power Platform CLI(pac)を入れる

```powershell
winget install --id Microsoft.PowerAppsCLI -e
```

- winget で入るのは起動用の部分だけ。続けて本体を入れる。

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
pac install latest
pac help
```

- `pac help` に `Version: 2.x` が出れば済み。
- 入れた直後のターミナルでは `pac` が見えないことがある。ターミナルを開き直すか、上の 1 行目で Path を読み直す(Git Bash からは見えないことが多いので、PowerShell で使う)。
- `dotnet tool install --global Microsoft.PowerApps.CLI.Tool` は、.NET 8 の SDK で「DotnetToolSettings.xml がパッケージで見つかりませんでした」で止まった。winget を使う。

## 3. サインインする(人が行う)

```powershell
pac auth list      # すでにサインインしていれば、ここに出る
pac auth create    # ブラウザが開くので、人がサインインする
```

- 「authenticated successfully」と出れば済み。

## 4. 環境を選ぶ(読むだけ)

```powershell
pac env list
pac admin list     # Type の列: Default = 会社全体 / Developer = 個人
pac copilot list --environment <環境の ID>   # その環境のエージェントの一覧
```

- 検証は、自分の **Developer** の環境で行う。ほかの人の Developer の環境・Default の環境は使わない。

## 5. 検証用のエージェントを作る(人が画面で行う)

1. Copilot Studio を開き、サインインする。
2. 右上の環境の切り替えで、4 章で選んだ Developer の環境を選ぶ。
3. 「エージェント」→「新しいエージェント」(会話で作る画面が出たら、「構成」のタブに切り替える)。
4. 名前: `CCP AI 出口の検証`
5. 指示の欄を押してから、次をそのまま貼る。

```text
あなたは、メールやアプリのお知らせの配信を企画する担当者を助ける AI です(CCP という配信の企画ツールから呼ばれる検証用)。
- 頼まれた文(見出し・コピー・制作指示・テーマの案など)を、日本語の指示どおりに作ります。
- 指示に「JSON で返す」とあれば、説明や前置きを付けず、指示された形の JSON だけを返します。
- 分からないことは作らず、分からないと答えます。
- 個人情報や社外秘の内容は出しません。
```

6. 右上の「作成」または「保存」。**公開はまだしない**(公開は 8 章で、Direct Line を開くとき)。
7. 作れたかを確かめる: `pac copilot list --environment <環境の ID>` に `CCP AI 出口の検証` が出る。

メモ: 名前の欄が選ばれた状態で開く。画面の写しが古く見えても、中身は入っていることがある。

## 6. 外すもの(未確認)

作ったエージェントの画面で、最初から入っているものを外す。頼みの中身が検索に使われたり、答えが CCP の頼みと関係のない内容で混ざったりするため。

| 所 | 外すもの |
|---|---|
| ツール | Work IQ |
| ナレッジ | すべての Web サイトを検索(「Web 検索」の切り替えも オフ) |
| 設定 → 生成 AI | 「一般的な知識を使う」は、まずはオン のまま(オフにすると、指示から答えを作れなくなることがある。結果を見て決める) |

## 7. テストの欄で試す

エージェントの画面の右の「テスト」の欄に、CCP と同じ形の頼みを貼る。CCP の見出しの言い換え(`src/simple/partAi.ts` の文言の直し)を縮めたもの:

```text
あなたは、メールマガジン・アプリの通知の文言を直す手伝いをする。担当者は、配信の 1 つの部品(件名・見出し・コピーなど)を選び、「もっと短く」のように頼む。
入力の part が直す部品(kind・label・current = いまの文言)、card が配信(テーマ theme・国・チャネル)。
次の JSON だけを返す:
{"mode":"update","reply":"依頼にどう応えたかを 1 文で","ideas":[{"text":"新しい文言","why":"そう直した理由を 1 文で"}]}

決まり:
1. ideas は 3 つ。それぞれ違う方向にする。
2. 文言は日本語。テーマから外れない。価格・割引率・期限など、入力にない事実を作らない。
3. 見出しは短く。

入力:
{"request":"もっと短く","part":{"kind":"heading","label":"見出し","current":"秋の新作ニットで、肌寒い朝もあたたかく過ごそう"},"card":{"theme":"秋の新作ニット","country":"JP","channel":"email"}}
```

見る所:

| 見る所 | よい | わるい |
|---|---|---|
| 答えの形 | `{` で始まり `}` で終わる JSON だけ | 前置き・説明・```` ``` ```` の囲み・箇条書きが付く |
| 中身 | `ideas` が 3 つ、`text` と `why` がある | 数が違う・項目の名前が違う |
| 決まり | 入力にない価格・期限を書かない | 事実を足す |
| 検索 | 答えに出典(Web のリンク)が付かない | 出典が付く(6 章で外せていない) |
| 速さ | 体感で数秒 | 10 秒を超える |

同じ頼みを 3 回投げて、形が毎回そろうかも見る。

## 8. Direct Line を開く(人が画面で行う。行う前に人に確かめる。未確認)

CCP のサーバーから呼ぶには、外から呼ぶ窓口(Direct Line)と、その鍵が要る。

1. エージェントの「設定」→「セキュリティ」→「認証」で、「認証なし」を選ぶ(Direct Line の鍵だけで呼ぶため。検証の間だけ)。
2. 右上の「公開」。
3. 「設定」→「セキュリティ」→「Web チャネルのセキュリティ」で、鍵(秘密)を表示してコピーする。
4. 鍵は、**リポジトリの外のファイル**に置く(例: `%USERPROFILE%\.ccp\ms-verify.env` に `DIRECT_LINE_SECRET=<鍵>`)。チャット・コミット・この文書に書かない。

## 9. CCP から呼ぶ

(まだ。作りは [AI_OUTLET_PLAN.md](AI_OUTLET_PLAN.md) の出口と層。層が Direct Line を呼ぶ形にする)

Direct Line の呼び方(層の中で行うこと):

1. `POST https://directline.botframework.com/v3/directline/conversations`(`Authorization: Bearer <鍵>`)で会話を始める。
2. `POST .../conversations/<会話の ID>/activities` に、頼みの文を `{"type":"message","from":{"id":"ccp"},"text":"…"}` で送る。
3. `GET .../conversations/<会話の ID>/activities?watermark=<前の続き>` を、エージェントの答え(`from.id` が自分でない `message`)が来るまで、間を置いて繰り返す。答えの終わりを知らせる合図はない。
4. 答えの `text` を、層との約束(版 1)の `{"text": …}` にして CCP に返す。

## 10. 測る項目

| 項目 | 測り方 | 記録 |
|---|---|---|
| 1 回の待ち | 頼みを送ってから答えが届くまでの秒数(10 回の中央値と最大) | |
| JSON の形 | 10 回のうち、そのまま JSON として読めた回数 | |
| 決まりを守るか | 入力にない事実を書いた回数 | |
| 検索を外せるか | 出典が付いた回数 | |
| 画像を渡せるか | Direct Line で画像を付けて送り、説明が返るか | |

## 11. 後片付け(人が行う)

- Copilot Studio で、エージェント `CCP AI 出口の検証` を消す(エージェントの一覧 → … → 削除)。
- 8 章の鍵を置いたファイルを消す。
- pac のサインインを消す: `pac auth clear`。
- pac を外す: `winget uninstall --id Microsoft.PowerAppsCLI`。
