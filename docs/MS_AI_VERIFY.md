# Microsoft の AI を CCP から呼ぶ検証の手順

2026-10-29 作成。検証が進むたびに足す。CCP の AI を外の層に頼む作りは [AI_OUTLET_PLAN.md](AI_OUTLET_PLAN.md)、Gemini と Microsoft の候補の比較は [AI_PLATFORMS.md](AI_PLATFORMS.md)。

## 検証する方式

どの方式も、CCP の外の層が呼ぶ(CCP のコードには Microsoft のつなぎを入れない)。同じ頼み(CCP の実際の頼み数件と、画像 1 件)で比べる。

| # | 方式 | 層の認証 | 状態 |
|---|---|---|---|
| 1 | Copilot Studio + Direct Line | Direct Line の鍵 → 短い期限のトークン | 比べる基準。8・9 章 |
| 2 | Copilot Studio + Microsoft 365 Agents SDK | Entra ID(**人のサインインが要る**。12 章) | 優先。下調べ済み。環境のクレジットの用意(管理者)待ちで、測るのは保留(1 章) |
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
| 環境の Copilot のクレジット | 環境に、Copilot のクレジットの割り当てか、従量課金の課金プラン(Azure のサブスクリプション)のつなぎが要る。**Developer の環境でも要る。テストの欄で試すだけでもクレジットを使う。** Power Platform の管理者が管理センターで行う(方式 1・2。方式 3 も同じになる見込み) |
| Windows の PC | winget が使えるもの |
| CCP の開発の環境 | サーバーを手元で動かせるもの(3 章以降で CCP から呼ぶとき) |

### つまずき: 「This environment is out of credits」

テストの欄で頼みを送ると「This environment is out of credits. Contact your admin to add more credits. Error code: EnforcementUsageCredits.」と出て止まる(2026-10-29。保存しただけの下書きのエージェントでも出た)。環境に使えるクレジットがない。Power Platform の管理者に、次のどれかを頼む(未確認。管理センターのメニューの名前は版で変わる)。

1. 従量課金の課金プランを作り、環境につなぐ(Azure のサブスクリプションに請求される)。
2. 組織が買った Copilot のクレジット(容量)を、環境に割り当てる。
3. Copilot Studio の個人の試用が組織で許されていれば、それを使う。

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
- 環境の ID を設定のファイルに書くときは、画面に出さずに取り出す(PowerShell で `pac env list` の表示名の行から取り出して、そのまま `ms-verify.env` に書く)。
- `pac copilot list` には、エージェントの名前・ID・状態が出る。**スキーマ名は出ない**ので、エージェントの「設定 → 詳細 → メタデータ」で見る(未確認)。
- **`pac copilot list` の `Component State` の `Published` は、画面の「公開」とは別のもの。** 画面で保存しただけ(下書き)のエージェントでも `Published` と出た(2026-10-29)。エージェントの記録が環境の中で使える状態になった、という意味らしい(未確認)。**公開したかは、Copilot Studio の画面(エージェントの状態・公開の日時)で確かめる。** pac 2.14.1 には、公開の日時を読むコマンドはない(`list` は環境の指定だけ、`status` はエラーで止まる)。
  - 公開の日時は、Dataverse の表 `bot` の列 `publishedon` にあるはず(未確認)。読むには Dataverse の Web API とそのトークンが要るので、この検証では画面で見る。
- `pac copilot status` は、pac 2.14.1 では `componentstate_Property` のエラーで止まった。
- `pac copilot extract-template` は、指定したファイルのほかに、**いま居るフォルダにも** `kickStartTemplate-1.0.0.json` を作る。リポジトリの中で流さない。中身にスキーマ名・モデルは入っていなかった。

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

6. **モデルを、既定に任せずにはっきり選ぶ**(エージェントの「概要」→「モデル」)。既定のモデルは、環境や時期で変わる。Claude になっていることもある(2026-10-29 の検証の環境では、既定は Claude Opus 5.5 だった)。既定のままだと、モデルが知らないうちに替わり、測った結果を比べられなくなる。
   - まず、既定と同じ段(Versatile)の GPT のモデルで測る。速さを比べるときは、速い段のモデルでも測る。
   - Anthropic のモデルを選ぶ前に、13 章を確かめる。
   - **選んだモデルの名前を、記録に書く**(10 章。測るプログラムは設定の `MODEL_LABEL`)。モデルを替えたら、頼みを測り直す。
7. 右上の「作成」または「保存」。**公開はまだしない**(公開は 8 章で、Direct Line を開くとき)。
8. 作れたかを確かめる: `pac copilot list --environment <環境の ID>` に `CCP AI 出口の検証` が出る。

メモ: 名前の欄が選ばれた状態で開く。画面の写しが古く見えても、中身は入っていることがある。

## 6. 外すもの(未確認)

作ったエージェントの画面で、最初から入っているものを外す。頼みの中身が検索に使われたり、答えが CCP の頼みと関係のない内容で混ざったりするため。

| 所 | 外すもの |
|---|---|
| ツール | Work IQ |
| ナレッジ | すべての Web サイトを検索(「Web 検索」の切り替えも オフ) |
| 設定 → 生成 AI | 「一般的な知識を使う」は、まずはオン のまま(オフにすると、指示から答えを作れなくなることがある。結果を見て決める) |

## 7. 頼み T1〜T6 で試す

CCP の実際の指示文(`src/aiSelect.ts`・`src/simple/partAi.ts`)を縮めた頼み。商品は架空。まず Copilot Studio の画面の右の「テスト」の欄に貼って試し、方式 2 では測るプログラム(12.4)が同じ頼みを送る。

| 頼み | 中身 | 回数 | 決まり(守れたら ○) |
|---|---|---|---|
| T1 | 部品の文言の言い換え | 3 | `mode` が `update`、`ideas` が 3 つ、それぞれに `text` と `why` |
| T2 | セクションの見出しの候補 | 1 | `titles` が 3 つ、見出しは 12 文字以内、「重ね着」を使わない(otherSections と重ねない)、`reason` は 40 文字以内 |
| T3 | 商品の選定 | 3 | 先頭の 2 つ(選定)が P01・P04、P03(春夏)を選ばない、P02 を選ぶなら理由に在庫、入力にない code を作らない、4 つまで |
| T4 | 決まりどおりのエラー | 1 | `{"error":"…"}` だけ(theme が空) |
| T5 | 英語のコピー | 1 | `copies` が 3 つ、コピーは英語で 25〜35 文字、`angle` は日本語 10 文字以内 |
| T6 | 画像の説明 | 1 | `description`・`tags`・`season` の JSON だけ。写っていないことを書かない |

- テストの欄では、頼みごとに「新しい会話」(テストの欄の上の ↻。未確認)にしてから貼る。前の答えが混ざらないように。
- T6 は、テストの欄で画像を付けられるときだけ。商品の写真(架空のもの・自分で撮ったもの)を 1 枚付けて、下の文を貼る。

### T1 部品の文言の言い換え

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

### T2 セクションの見出しの候補

```text
あなたは、ファッション通販の配信(メール・プッシュ)を企画するアシスタントです。
下の「入力」の JSON を読み、メールの 1 つのセクションの「見出しの候補」を、JSON だけで返してください。

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。説明文、見出し、箇条書き、コードフェンス(```)、前置き、あとがきは一切付けない。
{"titles":[{"title":"...","reason":"..."}]}
- titles は、切り口の異なる見出しの案を 3 つ。
- 入力の JSON が不正、または card.theme が空のときは、{"error":"理由を日本語で簡潔に"} だけを返す。
- section.productNames がある場合は、それに合う見出しにする。

# 見出し(title)のルール
1. 日本語で 12 文字以内。そのセクションの商品に共通する切り口を、配信テーマに沿って表す。
2. 商品カテゴリ名だけの見出しは避ける。
3. 案どうしで、切り口を変える。otherSections にある他のセクションの見出しとも、切り口が重ならないようにする。
4. reason は日本語で 40 文字以内。その見出しがどんな商品のまとまりを表すかを書く。

# 入力
{"card":{"theme":"秋の新作ニット","country":"JP","channel":"email","scheduledAt":"2026-11-05"},"section":{"wantTitle":true,"productNames":["ケーブル編みニット","モックネックセーター"]},"otherSections":[{"title":"重ね着のニット"}]}
```

### T3 商品の選定

```text
あなたは、ファッション通販の配信(メール・プッシュ)を企画するアシスタントです。
下の「入力」の JSON を読み、メールの 1 つのセクションに載せる「掲載商品とその候補」を、JSON だけで返してください。

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。説明文、見出し、箇条書き、コードフェンス(```)、前置き、あとがきは一切付けない。
{"products":[{"code":"P01","reason":"..."}]}
- products は、優先度の高い順に並べる。先頭から section.slots 件が「選定」、その続き 2 件が「残りの候補」。
- 入力の JSON が不正、または card.theme が空のときは、{"error":"理由を日本語で簡潔に"} だけを返す。

# 商品選定のルール
1. 商品は products の中からだけ選ぶ。候補にないものを作らない。code は入力のとおりに返す。同じ code を重複させない。
2. 配信テーマ(card.theme)との適合を最優先にする。次に、セクションの見出し(section.title)、配信日(scheduledAt)の季節を考慮する。
3. 在庫(stock)が少ない商品(50 未満)は避ける。やむを得ず選ぶときは、理由に在庫が少ないことを書く。
4. 同じ条件なら、売上トレンドが「上昇」の商品、レビュー評価が高い商品を優先する。売上トレンドが「下降」の商品は避ける。
5. 季節(season)が配信日の季節と合わない商品は避ける。「通年」はいつでも使える。
6. 理由(reason)は日本語。選定した商品は 60 文字以内、候補は 40 文字以内。

# 入力
{"card":{"theme":"秋の新作ニット","country":"JP","channel":"email","scheduledAt":"2026-11-05"},"section":{"title":"ぬくもりニット","slots":2},"products":[{"code":"P01","name":"ケーブル編みニット","category":"ニット","season":"秋冬","stock":420,"salesTrend":"上昇","rating":4.6},{"code":"P02","name":"モヘアカーディガン","category":"ニット","season":"秋冬","stock":35,"salesTrend":"上昇","rating":4.8},{"code":"P03","name":"リネンシャツ","category":"シャツ","season":"春夏","stock":600,"salesTrend":"横ばい","rating":4.2},{"code":"P04","name":"モックネックセーター","category":"ニット","season":"秋冬","stock":310,"salesTrend":"横ばい","rating":4.4},{"code":"P05","name":"ウールマフラー","category":"小物","season":"秋冬","stock":180,"salesTrend":"下降","rating":4},{"code":"P06","name":"デニムパンツ","category":"パンツ","season":"通年","stock":500,"salesTrend":"横ばい","rating":4.1}]}
```

### T4 決まりどおりのエラー

```text
あなたは、ファッション通販の配信(メール・プッシュ)を企画するアシスタントです。
下の「入力」の JSON を読み、メールの 1 つのセクションの「見出しの候補」を、JSON だけで返してください。

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。説明文、見出し、箇条書き、コードフェンス(```)、前置き、あとがきは一切付けない。
{"titles":[{"title":"...","reason":"..."}]}
- titles は、切り口の異なる見出しの案を 3 つ。
- 入力の JSON が不正、または card.theme が空のときは、{"error":"理由を日本語で簡潔に"} だけを返す。
- section.productNames がある場合は、それに合う見出しにする。

# 見出し(title)のルール
1. 日本語で 12 文字以内。そのセクションの商品に共通する切り口を、配信テーマに沿って表す。
2. 商品カテゴリ名だけの見出しは避ける。
3. 案どうしで、切り口を変える。otherSections にある他のセクションの見出しとも、切り口が重ならないようにする。
4. reason は日本語で 40 文字以内。その見出しがどんな商品のまとまりを表すかを書く。

# 入力
{"card":{"theme":"","country":"JP","channel":"email","scheduledAt":"2026-11-05"},"section":{"wantTitle":true,"productNames":["ケーブル編みニット","モックネックセーター"]},"otherSections":[{"title":"重ね着のニット"}]}
```

### T5 英語のコピー

```text
あなたは、ファッション通販の配信(メール・プッシュ)を企画するアシスタントです。
下の「入力」の JSON を読み、メールの 1 つのセクションの「コピーの候補」を、JSON だけで返してください。

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。説明文、見出し、箇条書き、コードフェンス(```)、前置き、あとがきは一切付けない。
{"copies":[{"copy":"...","angle":"..."}]}
- copies は、切り口の異なるコピーの案を 3 つ。
- 入力の JSON が不正、または card.theme が空のときは、{"error":"理由を日本語で簡潔に"} だけを返す。
- section.title(見出し)と section.productNames(選ばれた商品)がある場合は、それらを踏まえる。

# セクションのコピー(copies)のルール
1. 言語は language に従う('ja' は日本語、'en' は英語)。'auto' のときは card.country に合わせる(US は英語、JP は日本語)。
2. 長さは 30 文字前後(25〜35 文字。英語も文字数で数える)。1 文で。
3. 案どうしで、切り口を変える。angle には、その切り口を日本語 10 文字以内で書く。
4. 誇大な表現や、根拠のない断定(「最安値」「絶対」など)は使わない。

# 入力
{"language":"auto","card":{"theme":"Fall knits","country":"US","channel":"email","scheduledAt":"2026-11-05"},"section":{"title":"Cozy Knits","productNames":["Cable Knit Sweater","Mock Neck Sweater"]}}
```

### T6 画像の説明

```text
次の画像は、ファッション通販の商品の写真です。写真を見て、次の JSON だけを返してください。説明文や前置き、コードフェンスは付けない。
{"description":"写っている商品の説明(日本語 60 文字以内。写っていないことは書かない)","tags":["特徴を表す短い言葉を 3〜5 個"],"season":"春夏 / 秋冬 / 通年 のどれか 1 つ"}
```

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

## 10. 測る項目と記録

頼みごとに、次を記録する(T1・T3 は 3 回ずつ、ほかは 1 回)。方式 2 は、測るプログラム(12.4)が表に書き出す。

| 項目 | 見方 |
|---|---|
| モデル | エージェントに選んだモデルの名前(5 章の 6)。既定のままにしない |
| JSON | 答えがそのまま JSON として読めたか(○)。```` ``` ```` の囲みや前置きを外せば読めたか(△)。読めない(×) |
| 決まり | 7 章の表の決まりを守れたか |
| 出典 | 答えに Web のリンク・出典の番号が付いたか(6 章で検索を外せたか) |
| 秒数 | 頼みを送ってから、最初に何かが届くまで・本文が届くまで・終わりまで |
| 画像 | T6 の説明が、写っているものと合っているか |

方式ごとの比べ方:

| 項目 | 方式 1 | 方式 2 | 方式 3 | 方式 4 |
|---|---|---|---|---|
| モデル | | | | |
| 認証の形 | | | | |
| 人のサインインが要るか | | 要る(12.1) | | |
| データの地域 | | | | |
| 会話の記録が残るか | | | | |
| 待ち時間(T1 の中央値) | | | | |
| JSON の形(○ の数 / 全体) | | | | |
| 画像 | | | | |
| 費用の形 | Copilot のクレジット(環境に割り当て、または従量課金) | 方式 1 と同じ | Copilot のクレジット(2026-11 から。AI Builder のクレジットが移る見込み。未確認) | Azure の従量課金(使ったトークンの分)。Copilot のクレジットは要らない |
| 用意の手間 | 環境にクレジットを用意する(管理者)+ Direct Line を開く | 環境にクレジットを用意する(管理者)+ Entra のアプリの登録 + 人のサインイン | 環境にクレジットを用意する(管理者)+ Entra のアプリの登録 | Azure のリソースとモデルの用意(Azure の管理者) |

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
3. 測るプログラム(12.4)に設定を入れて動かす。サインインは人が行う。
4. 表(`results/<日時>.md`)を 10 章の比べ方に写す。

### 12.4 測るプログラム(リポジトリの外に置く)

Microsoft のサンプル `microsoft/Agents` の `samples/nodejs/copilotstudio-client` を元にした、Node(22 以上)のプログラム。7 章の T1〜T5 を送り、秒数と答えの形を表に書き出す(T6 の画像は、テストの欄で試す)。

| ファイル | 中身 |
|---|---|
| `%USERPROFILE%\.ccp\ms-verify\measure.mjs` | 送って測る本体 |
| `%USERPROFILE%\.ccp\ms-verify\tests.mjs` | T1〜T5 の頼みと、決まりの確かめ(7 章と同じ中身。直すときは両方) |
| `%USERPROFILE%\.ccp\ms-verify\package.json` | 使う部品(`@microsoft/agents-copilotstudio-client`・`@microsoft/agents-activity`・`@azure/msal-node`・`open`) |
| `%USERPROFILE%\.ccp\ms-verify.env` | 設定(下の 5 つ)。リポジトリに入れない |
| `%USERPROFILE%\.ccp\ms-verify\.token-cache.json` | サインインのトークン(プログラムが作る)。消すと、次はサインインし直し |
| `%USERPROFILE%\.ccp\ms-verify\results\` | 測った表(`<日時>_<モデル>.md`)と、答えの全文(同じ名前の `.json`) |

設定(`ms-verify.env`):

```text
COPILOT_ENVIRONMENT_ID=<環境の ID>          # エージェントの「設定 → 詳細 → メタデータ」
COPILOT_AGENT_SCHEMA_NAME=<スキーマ名>       # 同じ所
TENANT_ID=<テナント ID>                     # Entra のアプリの登録の「概要」
APP_CLIENT_ID=<アプリ(クライアント)ID>     # 同じ所
MODEL_LABEL=<モデルの名前>                  # エージェントの「概要」→「モデル」で選んだもの(記録に書く)
```

動かし方:

```powershell
cd $env:USERPROFILE\.ccp\ms-verify
npm install
node measure.mjs --self-test   # つながずに、確かめの仕組みだけを試す(5 つとも OK になる)
node measure.mjs               # T1〜T5 を送る。最初の 1 回だけブラウザが開くので、人がサインインする
node measure.mjs --only T3 --runs 5
node measure.mjs --model "<別のモデルの名前>"   # エージェントのモデルを替えたあと。MODEL_LABEL より優先
```

- 頼みごとに新しい会話を始める(CCP の呼び出しは 1 回ずつ独立しているため)。会話を始める秒数は、別の列に書く。
- 秒数は 3 つ: 最初に何かが届くまで(入力中の印など)・本文が届くまで・終わりまで。
- モデルの名前は、SDK からは分からないので、設定か `--model` で渡す。渡さないと止まる。表の先頭と、ファイルの名前(`<日時>_<モデル>.md`)に入る。

## 13. 確かめること: Copilot Studio で Anthropic のモデル(Claude)を使うとき(未確認)

Copilot Studio では、Microsoft の GPT のほかに、Anthropic などの外のモデルも選べる。外のモデルは、扱いが GPT と違う。下は 2026-10-29 に Microsoft Learn を読んだ内容で、**利用先の組織の契約と設定では、まだ確かめていない**。使う前に、組織の管理者と、データの扱いの担当に確かめる。

| 確かめること | 文書に書かれていたこと |
|---|---|
| 使えるようにする設定 | 管理者が 2 か所で許す: Power Platform の管理センターで、環境(または環境のグループ)に外のモデルを許す。Microsoft 365 の管理センターで、Anthropic を許す(Microsoft の「サブプロセッサ」として) |
| データの行き先 | Claude のモデルは、日本を含む多くの地域で「cross-geo」(**その地域の外で処理されることがある**)。Anthropic のモデルは、EU のデータ境界の約束から外れる、とも書かれている |
| 契約の条件 | いまは、Anthropic は Microsoft のサブプロセッサとして、Microsoft の製品の条件とデータ保護の付属書に従う、とされる。以前の文書では「Microsoft の契約が及ばない(独立した処理者)」とされていた(2026-05 に変わった)。古い文書と新しい文書が混ざっているので、最新のものを確かめる |
| 既定のモデル | 「既定」のモデルは、新しいモデルが出るたびに替わる。選んだモデルが使えなくなったときも、既定に戻って動く(知らないうちにモデルが替わることがある) |
| 試験中・プレビューのモデル | 本番に使わない。データが組織の地域の外で処理・保存されることがある。地域をまたぐデータの移動は、管理者が切り替える |

- **CCP の頼みには、配信の企画の中身(テーマ・商品の名前・在庫など)が入る。** Anthropic のモデルを使うと、その中身が Microsoft の外の会社で処理される扱いになりうる。使うかどうかは、利用先の組織が決める。
- 検証の環境で、既定が Claude になっていたのは、その環境で外のモデルがすでに許されていたためと考えられる(未確認)。

出典: Microsoft Learn「Select a primary AI model for your agent」(Copilot Studio)・「Choose an external model as the primary AI model」・「Allow external language models for generative responses」(Power Platform)・「Copilot in Microsoft 365 apps with Anthropic models」。
