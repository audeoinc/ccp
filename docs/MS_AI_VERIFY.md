# Microsoft の AI を CCP から呼ぶ検証の手順

2026-10-29 作成。検証が進むたびに足す。CCP の AI を外の層に頼む作りは [AI_OUTLET_PLAN.md](AI_OUTLET_PLAN.md)、Gemini と Microsoft の候補の比較は [AI_PLATFORMS.md](AI_PLATFORMS.md)。

## 検証する方式

どの方式も、CCP の外の層が呼ぶ(CCP のコードには Microsoft のつなぎを入れない)。同じ頼み(CCP の実際の頼み数件と、画像 1 件)で比べる。

| # | 方式 | 層の認証 | 状態 |
|---|---|---|---|
| 1 | Copilot Studio + Direct Line | Direct Line の鍵 → 短い期限のトークン | 比べる基準。8・9 章 |
| 2 | Copilot Studio + Microsoft 365 Agents SDK | Entra ID(**人のサインインが要る**。12 章) | 優先。下調べ済み |
| 3 | AI Builder のプロンプトを Dataverse の窓口で呼ぶ | Entra ID のアプリ | 未着手 |
| 4 | Azure OpenAI | API の鍵 または Entra ID のアプリ | 参考。あとで |

比べる項目: 認証の形・人のサインインが要るか・データの地域・会話の記録が残るか・待ち時間・JSON の形・画像・費用の形・用意の手間(10 章)。

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

## 12. 方式 2: Copilot Studio + Microsoft 365 Agents SDK

### 12.1 下調べ(2026-10-29。公式の文書とサンプルを読んだ。動かしてはいない)

| 調べたこと | 分かったこと |
|---|---|
| 人のサインインなしに、サーバーがアプリの名前で呼べるか | **できない。** サンプルの説明に「S2S is not currently supported for Copilot Studio」とある。クライアントは人のトークンが要る。アプリだけの認証は「予定にある」とされるが、時期は書かれていない |
| Entra のアプリの登録 | 公開クライアント(ネイティブ)のアプリ。リダイレクト URI は `http://localhost`。クライアントのシークレットは持たない |
| API の権限 | Power Platform API の**委任された権限** `CopilotStudio.Copilots.Invoke`(Python のサンプルは、ほかに Microsoft Graph の `User.Read`)。管理者の同意は組織の決まりに従う |
| エージェントの側の設定 | 公開したエージェントが要る。「設定 → セキュリティ → 認証」は、SDK を使うだけなら「認証なし」にしなくてよい。つなぐ値は「チャネル → Web アプリ」の接続文字列、または「設定 → 詳細 → メタデータ」の環境の ID とスキーマ名 |
| 言語 | .NET・JavaScript・Python のサンプルがある(Python は 3.10 以上) |
| 答えを届いた分から受け取れるか | できる(届いた順に読む仕組みがある、と Microsoft のチームのブログ。サンプルの説明には書かれていない) |
| 画像を渡せるか | **分からない。** エージェントの「生成 AI」の設定で画像の入力を許す項目はあるが、SDK で画像を付けて送れるかは文書に書かれていない。試して確かめる |
| 会話の記録 | (未確認)Copilot Studio は会話の記録を環境に残す。期間と、残さない設定ができるかは調べる |

出典: Microsoft Learn「Integrate web or native apps with Microsoft 365 Agents SDK」、GitHub `microsoft/Agents` の `samples/*/copilotstudio-client` の説明、Copilot Studio のチームのブログ「Every Path to Integrating Your Copilot Studio Agent」。

### 12.2 人のサインインが要るときの形(案)

| 形 | 中身 | 問題 |
|---|---|---|
| A. 利用者ごとのサインイン | CCP の利用者が、Microsoft にサインインする。層は、その人のトークンでエージェントを呼ぶ | CCP の画面にサインインの流れを足す必要がある(CCP の作りが大きく変わる)。利用者全員に Microsoft のアカウントと Copilot Studio を使う権限が要る |
| B. 共用のアカウント | 層が、AI 用の 1 つのアカウントでサインインしたトークンを持ち、それで呼ぶ | 人のアカウントを機械に使わせる形で、組織の決まりに触れやすい。多要素認証・パスワードの期限でトークンが切れ、人がサインインし直す必要がある。だれが使ったかが残らない |
| C. 待つ | アプリだけの認証が出るまで、方式 1 か 3 で検証する | 時期が分からない |

### 12.3 試すときの段取り(人の指示のあと)

1. Entra に、公開クライアントのアプリを登録する(12.1 の権限)。テナント ID・アプリ ID はリポジトリの外のファイルに置く。
2. エージェントを公開する(5 章で作ったもの)。
3. Python のサンプルを、リポジトリの外のフォルダで動かす。サインインは人が行う(トークンはそのフォルダの `.local_token_cache.json` に残るので、リポジトリに入れない)。
4. 7 章の頼みを送り、10 章の項目を測る。
