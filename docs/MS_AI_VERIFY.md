# Microsoft の AI を CCP から呼ぶ検証の手順

2026-10-29 作成、2026-10-30 まとめ。CCP の AI を外の層に頼む作りは [AI_OUTLET_PLAN.md](AI_OUTLET_PLAN.md)、Gemini と Microsoft の候補の比較は [AI_PLATFORMS.md](AI_PLATFORMS.md)。

## 結論(2026-10-30 時点)

- **Copilot Studio のエージェントは、CCP の頼みに JSON で正しく答えられる。** CCP の実際の頼みを縮めた T1〜T6(言い換え・見出し・商品の選定・エラー・英語・画像)を、方式 1・2 で合わせて 12 回送り、JSON は 12 回とも ○、決まりは 11 回 ○(方式 2 の T5 だけ、英語のコピーが 2〜3 文字長かった)。前置き・囲み・出典は 1 度も付かなかった。
- **CCP から呼ぶなら、方式 1(Direct Line)が向いている。** 人のサインインなしに、CCP のサーバーが鍵だけで呼べる。速さ・答えの形・画像は方式 2 と同じだった。
- **方式 2(Agents SDK)は、CCP の利用者一人ひとりに Microsoft のサインインが要る**(アプリだけで呼ぶ形が、まだない)。CCP には向かない。
- 速さは、1 回あたり本文まで 3〜6 秒 + 会話を始める 0.2〜1.8 秒。CCP の「AI で下書き」(6〜9 回呼ぶ)を順に呼ぶと 30〜50 秒ほど。
- 費用は Copilot のクレジット(1 回あたり約 1)。環境にクレジットの用意が要る(管理者)。

| 方式 | 結果 | 人のサインイン | 本文まで | JSON | 画像 |
|---|---|---|---|---|---|
| **1. Copilot Studio + Direct Line** | **疎通・T1〜T6 済み** | **要らない**(鍵 → 短い期限のトークン) | 3.0〜4.6 秒 | 6 / 6 ○ | ○(upload の入口) |
| 2. Copilot Studio + Agents SDK | 疎通・T1〜T6 済み | **要る** | 3.3〜6.1 秒 | 6 / 6 ○ | ○(添付の `data:` の URL) |
| 3. AI Builder を Dataverse から呼ぶ | 未着手(これから検証する) | — | — | — | — |

Azure OpenAI は、いまは想定していない(2026-10-29 利用者)。

### まだのこと

| こと | なぜ |
|---|---|
| データの扱い | 会話の記録がどこに・どれだけ残るか(13 章)。GPT Chat Latest は、日本では「cross-geo」(日本の外で処理されることがある)の扱い(14 章) |
| 大きい写真で T6 | 小さい写真(118×107 ピクセル)だったので、細部(ポケットかボタンか)が回ごとに違った |
| 同じ頼みを何回も送ったときのばらつき | 方式 1 は 1 回ずつしか測っていない |
| 方式 3(AI Builder)の検証 | 方式 1 と比べるため(2026-10-30 利用者)。Dataverse の窓口の認証、AI Builder のクレジットが Copilot のクレジットに移ることの影響も見る |
| CCP の層を作る | [AI_OUTLET_PLAN.md](AI_OUTLET_PLAN.md) の出口と、Direct Line を呼ぶ層(9 章)。作るかは利用者が決める |

## 読む前に

- 比べる項目: 認証の形・人のサインインが要るか・データの地域・会話の記録が残るか・待ち時間・JSON の形・画像・費用の形・用意の手間(10 章)。
- Copilot Studio の画面の名前は、画面の版で変わることがある。**「(未確認)」の印がある所は、実際の画面でまだ確かめていない。**確かめたら印を消す。
- この文書には、テナント・環境の名前、環境の ID・URL、メールアドレス、鍵を書かない。`<環境の ID>` のように置き換えて書く。

## 0. 守ること

- **サインインは人が行う。** Claude はパスワードを入れない。`pac auth create` でブラウザが開いたら、人に頼む。
- **環境にものを作るのは、人の指示があってから。** どの環境に何を作るかを、先に人に確かめる。
- **消すのは人。** Claude は、エージェントや環境を消さない。消し方を伝えて、人に消してもらう。
- 調べるだけのコマンド(`pac env list` など)は、確かめなしで行ってよい。
- **鍵(Direct Line のシークレット)・トークン・環境の ID・URL は、リポジトリの外に置く。** サーバーの設定(環境変数)か、リポジトリの外のファイル(`%USERPROFILE%\.ccp\ms-verify.env`)。コミット・チャット・文書に書かない。画面に出すときは、値を出さずに「入っている・長さ」だけを出す。

## 1. 用意するもの

| もの | 中身 |
|---|---|
| Microsoft のアカウント | Copilot Studio を使えるもの。サインインは人が行う |
| Power Platform の Developer の環境 | 個人の検証用の環境。会社全体の既定の環境(Default)は使わない |
| 環境の Copilot のクレジット | 環境に、Copilot のクレジットの割り当てか、従量課金の課金プラン(Azure のサブスクリプション)のつなぎが要る。**Developer の環境でも要る。テストの欄で試すだけでもクレジットを使う。** Power Platform の管理者が管理センターで行う(方式 1・2。方式 3 も同じになる見込み) |
| Windows の PC | winget と Node(22 以上)が使えるもの |
| Entra のアプリの登録 | 方式 2 だけ。12.3 |

### つまずき: 「This environment is out of credits」

テストの欄で頼みを送ると「This environment is out of credits. Contact your admin to add more credits. Error code: EnforcementUsageCredits.」と出て止まる(2026-10-29。保存しただけの下書きのエージェントでも出た)。環境に使えるクレジットがない。Power Platform の管理者に、次のどれかを頼む(未確認。管理センターのメニューの名前は版で変わる)。

1. 従量課金の課金プランを作り、環境につなぐ(Azure のサブスクリプションに請求される)。
2. 組織が買った Copilot のクレジット(容量)を、環境に割り当てる。
3. Copilot Studio の個人の試用が組織で許されていれば、それを使う。

環境にクレジットが付いたら、同じ下書きのエージェントのまま、テストの欄で答えが返るようになった(2026-10-30。公開は要らない)。テストの欄の頼みも 1 回ごとにクレジットを使う(T1 で 1 回あたり約 1 クレジット。10.1)。

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
- `pac copilot list` には、エージェントの名前・ID・状態が出る。**スキーマ名は出ない**ので、エージェントの「設定 → 詳細 → メタデータ」で見る。
- **`pac copilot list` の `Component State` の `Published` は、画面の「公開」とは別のもの。** 画面で保存しただけ(下書き)のエージェントでも `Published` と出た(2026-10-29)。**公開したかは、Copilot Studio の画面で確かめる。** pac 2.14.1 には、公開の日時を読むコマンドはない(`list` は環境の指定だけ、`status` は `componentstate_Property` のエラーで止まる)。公開の日時は Dataverse の表 `bot` の列 `publishedon` にあるはず(未確認)。
- `pac copilot extract-template` は、指定したファイルのほかに、**いま居るフォルダにも** `kickStartTemplate-1.0.0.json` を作る。リポジトリの中で流さない。中身にスキーマ名・モデルは入っていなかった。

## 5. 検証用のエージェントを作る(人が画面で行う)

方式ごとに、エージェントを分けて作る(方式 1 は認証を変えるので、方式 2 と同じエージェントは使えない)。

| エージェント | 方式 | 認証 |
|---|---|---|
| `CCP AI 出口の検証 標準` | 2(Agents SDK) | Microsoft で認証する(既定のまま) |
| `CCP AI 出口の検証 DL` | 1(Direct Line) | 認証なし + 鍵を必須(8 章) |

1. Copilot Studio を開き、サインインする。
2. 右上の環境の切り替えで、4 章で選んだ Developer の環境を選ぶ。
3. **標準(standard)のハーネスで作る。** 作る種類を選ぶ画面で、「Other ways to build」の下の **「エージェント [標準]」**(事前に定義したトピックとフローを使う、ルールベースの会話エージェント)を選ぶ(2026-10-30 確かめた)。いちばん上の「エージェント [GitHub Copilot]」で作ると、CCP から呼べない(12.6)。「エージェント [会話型 AI]」は、チャット・音声の顧客対応向けの別の種類なので選ばない。
4. 名前: 上の表のとおり。
5. 指示の欄を押してから、次をそのまま貼る。

```text
あなたは、メールやアプリのお知らせの配信を企画する担当者を助ける AI です(CCP という配信の企画ツールから呼ばれる検証用)。
- 頼まれた文(見出し・コピー・制作指示・テーマの案など)を、日本語の指示どおりに作ります。
- 指示に「JSON で返す」とあれば、説明や前置きを付けず、指示された形の JSON だけを返します。
- 分からないことは作らず、分からないと答えます。
- 個人情報や社外秘の内容は出しません。
```

6. 右上の「作成」。エージェントの「概要」の画面になる。
7. **モデルを、既定に任せずにはっきり選ぶ**(「概要」→「モデル」)。標準のハーネスでは **GPT Chat Latest** を選ぶ(12.6)。既定のモデルは環境や時期で変わり、Claude になっていることもある(2026-10-29 の検証の環境では、GitHub Copilot ハーネスの既定が Claude Opus 5.5 だった)。Anthropic のモデルを選ぶ前に 14 章を確かめる。**選んだモデルの名前を記録に書く**(測るプログラムは設定の `MODEL_LABEL`)。
8. 6 章の設定にして、右上の「保存」。
9. テストの欄で T1 を 1 回試す(7 章)。JSON が返れば OK。
10. 右上の「公開」→「公開する」(「最新バージョンを強制する」のチェックは入れない。Teams などで続いている会話を新しい版に切り替えるためのもので、検証では要らない)。
11. 「設定」→「詳細」→「メタデータ」の **スキーマ名** を、`ms-verify.env` の `COPILOT_AGENT_SCHEMA_NAME` に書く(方式 2 のエージェント)。

## 6. エージェントの設定(標準のハーネス)

2026-10-30 に画面で確かめた設定。

| 所 | 設定 | 理由 |
|---|---|---|
| 生成 AI → オーケストレーション | **はい**(生成 AI オーケストレーション) | 「いいえ(クラシック)」だと、決めたトピックにしか答えない。CCP の頼みは毎回違う文 |
| ナレッジ → 根拠のない応答を許可する | **オン** | オフにすると、ナレッジ・ツールを使わない答えが止められる。CCP の頼みは、指示と入力だけで答えを作る |
| ナレッジ → Web の情報を使用する | **オフ** | 頼みの中身が Bing の検索に使われない。出典が付かない |
| ナレッジ・ツール | 何も足さない | 頼みと関係のない内容が混ざらないように |
| ファイルの処理能力 → ファイルをアップロードする | **オン** | T6(画像)に要る。画像は png・webp・jpeg・gif、15MB まで |
| ファイルの処理能力 → コード インタープリター | **オフ** | CCP の頼みには要らない。プレミアム(追加の費用) |
| セキュリティ → 認証 | 方式 2: Microsoft で認証する(既定のまま)/ 方式 1: 認証なし(8 章) | |

GitHub Copilot ハーネスのエージェントには、最初から「ツール: Work IQ」と「ナレッジ: すべての Web サイトを検索」が入っていた(外す)。

## 7. 頼み T1〜T6

CCP の実際の指示文(`src/aiSelect.ts`・`src/simple/partAi.ts`)を縮めた頼み。商品は架空。Copilot Studio の画面の右の「テスト」の欄に貼って試すか、測るプログラム(12.4)で送る。

| 頼み | 中身 | 決まり(守れたら ○) |
|---|---|---|
| T1 | 部品の文言の言い換え | `mode` が `update`、`ideas` が 3 つ、それぞれに `text` と `why` |
| T2 | セクションの見出しの候補 | `titles` が 3 つ、見出しは 12 文字以内、「重ね着」を使わない(otherSections と重ねない)、`reason` は 40 文字以内 |
| T3 | 商品の選定 | 先頭の 2 つ(選定)が P01・P04、P03(春夏)を選ばない、P02 を選ぶなら理由に在庫、入力にない code を作らない、4 つまで |
| T4 | 決まりどおりのエラー | `{"error":"…"}` だけ(theme が空) |
| T5 | 英語のコピー | `copies` が 3 つ、コピーは英語で 25〜35 文字、`angle` は日本語 10 文字以内 |
| T6 | 画像の説明 | `description`(60 文字以内)・`tags`(3〜5 個)・`season`(春夏 / 秋冬 / 通年)の JSON だけ。写っていないことを書かない |

- テストの欄では、頼みごとに ↻(会話をリセット)を押して新しい会話にしてから貼る。前の答えが混ざらないように。
- T6 は、商品の写真(自分で撮ったもの・自由に使ってよい見本)を 1 枚付けてから貼る。お客さまや利用先の本物の商品の写真は使わない。

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

## 8. 方式 1: Direct Line を開く(人が画面で行う)

方式 1 用のエージェント `CCP AI 出口の検証 DL` で行う(5 章の手順で作り、6 章の設定にしたもの)。2026-10-30 に確かめた手順。

1. **「設定」→「セキュリティ」→「認証」で「認証なし」を選ぶ。** Direct Line の鍵だけで呼ぶため。
2. **すぐに「設定」→「セキュリティ」→「Web チャネルのセキュリティ」で「セキュリティで保護されたアクセスを要求する」をオンにする。** 認証なしのままだと、トークン エンドポイントの URL を知っている人なら、鍵なしで話しかけられる(試して確かめた。下の囲み)。
3. 同じ画面の **シークレット 1** をコピーし、`ms-verify.env` に `DIRECT_LINE_SECRET=<シークレット>` の行を足す。チャットには貼らない。
4. **右上の「公開」→「公開する」。** 2 の設定は、**公開して初めて効く**。
5. 鍵なしの入口で断られることを確かめる(12.4 の `check-token-endpoint.mjs`)。

Direct Line の窓口は、既定の `https://directline.botframework.com` でつながった(地域ごとの窓口は要らなかった)。窓口を変えるときは、`ms-verify.env` に `DIRECT_LINE_ENDPOINT=<窓口の URL の /v3/directline の手前まで>` を書く。

> **鍵を必須にした効き目(2026-10-30 に確かめた)**
> Direct Line のトークン エンドポイント(`https://<環境のホスト>/powervirtualagents/botsbyschema/<スキーマ名>/directline/token?api-version=2022-03-01-preview`)に、鍵なしでトークンを頼んだ。
>
> | 「セキュリティで保護されたアクセスを要求する」 | 公開 | 鍵なしの頼み |
> |---|---|---|
> | オン | 済み | **403・トークンは出ない**(「ErrorCode 4011: The bot isn't available at this time」) |
> | オフ | 済み | **200・トークンが出る**(だれでも話しかけられる) |
> | オンに戻した | **まだ** | **200・トークンが出続けた** |
> | オン | 済み | 403 に戻った |
>
> - オフのままにしない。この設定を変えたら、必ず公開し、鍵なしの入口で断られることを確かめる。
> - チャネルの画面(「Web アプリ」「ネイティブ アプリ」)に出る `…/copilotstudio/dataverse-backed/authenticated/bots/<スキーマ名>/conversations` は **Agents SDK 用の接続先**で、トークン エンドポイントではない(人のトークンを付けて使う。鍵なしの GET は 404)。

## 9. 方式 1 で呼ぶ形(CCP の層が行うこと)

測るプログラム(12.4 の `--via dl`)で確かめた形。CCP の層([AI_OUTLET_PLAN.md](AI_OUTLET_PLAN.md))も、この形にする。

1. **鍵を短い期限のトークンに取り替える**: `POST https://directline.botframework.com/v3/directline/tokens/generate`(`Authorization: Bearer <鍵>`)→ `{"token": …}`。鍵は、ここでしか使わない。
2. **会話を始める**: `POST …/v3/directline/conversations`(`Authorization: Bearer <トークン>`)→ `{"conversationId": …}`。CCP の呼び出しは 1 回ずつ独立しているので、**頼みごとに新しい会話**にする(前の答えが混ざらないように)。1 と 2 で 0.2〜0.7 秒。
3. **頼みを送る**:
   - 文だけ: `POST …/conversations/<会話の ID>/activities` に `{"type":"message","from":{"id":"<層の名前>"},"locale":"ja-JP","text":"…"}`。答えの `id` を控える。
   - **画像あり**: `POST …/conversations/<会話の ID>/upload?userId=<層の名前>` に multipart で、`activity`(`Content-Type: application/vnd.microsoft.activity`。上と同じ JSON)と `file`(画像)を一緒に送る。**添付の `data:` の URL は、エージェントに「InvalidUri」で断られる。**
4. **答えを取りに行く**: `GET …/conversations/<会話の ID>/activities?watermark=<前の続き>` を、間を置いて繰り返す(測るプログラムは 0.25 秒ごと)。**答えの終わりを知らせる合図はない。** 自分以外から届いた `message` で、`replyToId` が 3 で控えた `id` のものを答えとみなす。答えは 1 通でまとめて届いた。
5. 答えの `text` を、層との約束(版 1)の `{"text": …}` にして CCP に返す。決まった時間(例: 120 秒)待っても届かなければ失敗として返す。

- 鍵は CCP のサーバーの設定(環境変数)に置く。漏れたら、画面でシークレットを作り直す。
- この形では、**どの利用者が頼んだかは、Copilot Studio の側には残らない**(すべて層の名前になる)。残すなら CCP の側で残す。
- **だれがエージェントを使えるかは、CCP に入れる人で決まる。** エージェントを呼べるのは鍵を持つ CCP のサーバーだけなので、CCP の画面に入れる人が、CCP を通してエージェントを使える。組織の人だけに絞るなら、**CCP の入口で組織のサインイン(Microsoft の Entra ID など)を通す**。方式 2 と違い、利用者一人ひとりに Copilot Studio の権限は要らない(Copilot Studio が利用者を確かめるのではなく、CCP が確かめる)。

## 10. 測る項目と記録

| 項目 | 見方 |
|---|---|
| モデル | エージェントに選んだモデルの名前(5 章の 7)。既定のままにしない |
| JSON | 答えがそのまま JSON として読めたか(○)。```` ``` ```` の囲みや前置きを外せば読めたか(△)。読めない(×) |
| 決まり | 7 章の表の決まりを守れたか |
| 出典 | 答えに Web のリンク・出典の番号が付いたか(6 章で検索を外せたか) |
| 秒数 | 会話を始めるまで・頼みを送ってから最初に何かが届くまで・本文が届くまで・終わりまで |
| 画像 | T6 の説明が、写っているものと合っているか |
| クレジット | 使った Copilot のクレジット(画面に出る数。1 回あたりに割る) |

### 10.1 記録

| 日 | 方式 | 所 | モデル | 頼み | 回 | JSON | 決まり | 出典 | 秒数 | クレジット | メモ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-30 | 2(GitHub Copilot ハーネス) | テストの欄 | GPT 6.1 Sol | T1 | 3 | 3 / 3 ○ | 3 / 3 ○ | なし | 未記録 | 3 回で 3.02(1 回あたり約 1) | 案の長さ 7・13・9 文字など(元は 23 文字)。3 回の案はほぼ同じ |
| 2026-10-30 | 2(GitHub Copilot ハーネス) | 測るプログラム(Agents SDK) | GPT 6.1 Sol | T1 | 1 | × | × | — | 会話を始める 0.90・本文 0.41 | — | **断られた**: 「This action doesn't support agents built with the GitHub Copilot harness.」(12.6) |
| 2026-10-30 | 2(標準のハーネス) | テストの欄 | GPT Chat Latest | T1 | 1 | ○ | ○ | なし | 未記録 | — | 7・8・8 文字 |
| 2026-10-30 | 2(標準のハーネス) | 測るプログラム(Agents SDK) | GPT Chat Latest | T1 | 1 | ○ | ○ | なし | 始める 0.77・最初に届く 0.12・本文 4.50 | — | **疎通できた**。入力中の印が先に届き、本文は 1 通でまとめて届いた |
| 2026-10-30 | 2(標準のハーネス) | 測るプログラム | GPT Chat Latest | T1 | 1 | ○ | ○ | なし | 始める 1.83・本文 3.78 | — | 7・9・11 文字 |
| 2026-10-30 | 2(標準のハーネス) | 測るプログラム | GPT Chat Latest | T2 | 1 | ○ | ○ | なし | 始める 0.63・本文 4.16 | — | 「編み地で魅せる秋」「首元から秋支度」「ぬくもり新定番」。「重ね着」を避けた |
| 2026-10-30 | 2(標準のハーネス) | 測るプログラム | GPT Chat Latest | T3 | 1 | ○ | ○ | なし | 始める 0.73・本文 6.12 | — | 選定 P01・P04、候補 P02(理由に「在庫35と少ない」)・P05(理由に「下降」)。P03 は選ばず |
| 2026-10-30 | 2(標準のハーネス) | 測るプログラム | GPT Chat Latest | T4 | 1 | ○ | ○ | なし | 始める 0.31・本文 3.29 | — | `{"error":"card.themeが空です"}` だけ |
| 2026-10-30 | 2(標準のハーネス) | 測るプログラム | GPT Chat Latest | T5 | 1 | ○ | **×** | なし | 始める 0.67・本文 3.53 | — | 英語・angle は日本語で守れたが、**コピーが 37・38・37 文字**(決まりは 25〜35)。少し長い |
| 2026-10-30 | 2(標準のハーネス) | テストの欄 | GPT Chat Latest | T6 | 1 | ○ | ○ | なし | 未記録 | — | 緑の襟付き長袖の上着の写真(118×107 ピクセル)。「深いグリーンの襟付き長袖ジャケット。フロントにポケット付き。」・タグ 5 つ・秋冬 |
| 2026-10-30 | 2(標準のハーネス) | 測るプログラム | GPT Chat Latest | T6 | 1 | ○ | ○ | なし | 始める 0.67・本文 4.15 | — | **SDK から画像を渡せた**(添付の `data:` の URL)。「…フロントボタン仕様。」。テストの欄と細部が違う(写真が小さいため) |
| 2026-10-30 | **1**(標準のハーネス・認証なし・鍵を必須) | 測るプログラム(Direct Line) | GPT Chat Latest | T1 | 1 | ○ | ○ | なし | 始める 0.69・本文 4.24 | — | **疎通できた。人のサインインなし** |
| 2026-10-30 | 1 | 測るプログラム(Direct Line) | GPT Chat Latest | T1〜T5 | 各 1 | 5 / 5 ○ | 5 / 5 ○ | なし | 始める 0.20〜0.45・本文 3.04〜4.59 | — | T5 も 25〜35 文字に収まった。T3 は P01・P04、候補 P02(在庫 35 と書いた)・P06 |
| 2026-10-30 | 1 | 測るプログラム(Direct Line) | GPT Chat Latest | T6 | 1 | ○ | ○ | なし | 始める 0.53・本文 3.55 | — | 添付の `data:` の URL は「InvalidUri」で断られ、**upload の入口なら渡せた**。「深みのあるグリーンの襟付き長袖アウター。フロントボタン仕様。」 |
| 2026-10-30 | 1 | 鍵なしの入口 | — | — | — | — | — | — | — | — | 鍵を必須にして公開すると 403、オフだと 200(8 章の囲み) |

### 10.2 方式ごとの比べ方

| 項目 | 方式 1(Direct Line) | 方式 2(Agents SDK) | 方式 3 |
|---|---|---|---|
| モデル | GPT Chat Latest(標準のハーネス) | GPT Chat Latest(標準のハーネス) | |
| 認証の形 | Direct Line の鍵 → 短い期限のトークン。エージェントは「認証なし」+「鍵を必須」 | Entra ID・委任された権限(公開クライアントのアプリ) | Entra ID のアプリ(見込み) |
| 人のサインインが要るか | **要らない** | **要る**(12.1) | |
| データの地域 | 未確認(14 章) | 未確認(14 章) | |
| 会話の記録が残るか | 未確認(13 章) | 未確認(13 章) | |
| 待ち時間 | 本文まで 3.0〜4.6 秒 + 始める 0.2〜0.7 秒(0.25 秒ごとに取りに行く) | 本文まで 3.3〜6.1 秒 + 始める 0.3〜1.8 秒 | |
| JSON の形(○ の数 / 全体) | 6 / 6(決まりも 6 / 6) | 6 / 6(決まりは 5 / 6) | |
| 画像 | ○(upload の入口) | ○(添付の `data:` の URL) | |
| 費用の形 | Copilot のクレジット(1 回あたり約 1) | 方式 1 と同じ | Copilot のクレジット(2026-11 から。AI Builder のクレジットが移る見込み。未確認) |
| 用意の手間 | 環境のクレジット(管理者)+ エージェントの設定(認証なし・鍵を必須・公開) | 環境のクレジット(管理者)+ Entra のアプリの登録 + 利用者ごとのサインイン | 環境のクレジット(管理者)+ Entra のアプリの登録 |
| 誰が頼んだか | Copilot Studio には残らない(CCP で残す) | 頼んだ人として残る | |

## 11. 後片付け(人が行う)

| もの | 片付け方 |
|---|---|
| エージェント | Copilot Studio で、`CCP AI 出口の検証`(GitHub Copilot ハーネス)・`CCP AI 出口の検証 標準`・`CCP AI 出口の検証 DL` を消す(エージェントの一覧 → … → 削除) |
| Direct Line の鍵 | エージェントを消さないなら、「Web チャネルのセキュリティ」でシークレットを再生成して、古い鍵を無効にする |
| Entra のアプリ | 「CCP AI 出口の検証 SDK」の登録を消す(Entra の管理センター)。承諾だけを取り消すなら `https://myapps.microsoft.com` から |
| サインインのトークン | `%USERPROFILE%\.ccp\ms-verify\.token-cache.json` を消す(アクセストークンと更新用のトークンが入っている) |
| 設定のファイル | `%USERPROFILE%\.ccp\ms-verify.env` を消す(鍵・環境の ID・トークン エンドポイントの URL が入っている) |
| 書き出したテンプレート | `%USERPROFILE%\.ccp\ms-verify\template\` を消す(組織の識別子が入っている) |
| pac | サインインを消す: `pac auth clear`。外す: `winget uninstall --id Microsoft.PowerAppsCLI` |

## 12. 方式 2: Copilot Studio + Microsoft 365 Agents SDK

### 12.1 下調べと、試して分かったこと

| 調べたこと | 分かったこと |
|---|---|
| 人のサインインなしに、サーバーがアプリの名前で呼べるか | **できない。** サンプルの説明に「S2S is not currently supported for Copilot Studio」とある。クライアントは人のトークンが要る。アプリだけの認証は「予定にある」とされるが、時期は書かれていない |
| Entra のアプリの登録 | 公開クライアント(ネイティブ)のアプリ。リダイレクト URI は `http://localhost`。クライアントのシークレットは持たない(1 回ごとの合言葉 PKCE で、同じプログラムかを示す) |
| API の権限 | Power Platform API の**委任された権限** `CopilotStudio.Copilots.Invoke` と、Microsoft Graph の `User.Read`。承諾の画面には「Allows Invoking Copilots」「Sign you in and read your profile」と出た。承諾は承諾した人の分だけ |
| 呼べるかの確かめ | サインインのときではなく、**エージェントを呼ぶときに**、その人がそのエージェントを使えるかが確かめられる |
| エージェントの側の設定 | 公開したエージェントが要る。認証は「Microsoft で認証する」のままでよい。つなぐ値は「設定 → 詳細 → メタデータ」の環境の ID とスキーマ名 |
| 言語 | .NET・JavaScript・Python のサンプルがある |
| 答えを届いた分から受け取れるか | 届いた順に読む仕組みはある。ただし試したときは、入力中の印のあと、本文は 1 通でまとめて届いた |
| 画像を渡せるか | **渡せた**。「ファイルをアップロードする」をオンにし、メッセージの添付に `{contentType: "image/png", contentUrl: "data:image/png;base64,…"}` を付けて送る。文書には書かれていなかった |
| エージェントを作り直したとき | テナント ID・アプリ ID・サインインはそのまま使えた(アプリの権限は特定のエージェントに結びついていない)。変えるのはスキーマ名だけ |

出典: Microsoft Learn「Integrate web or native apps with Microsoft 365 Agents SDK」、GitHub `microsoft/Agents` の `samples/*/copilotstudio-client` の説明、Copilot Studio のチームのブログ「Every Path to Integrating Your Copilot Studio Agent」。

### 12.2 人のサインインが要るときの形(案)

**CCP の利用者ごとにこの形で呼ぶなら、利用者の一人ひとりに Microsoft のアカウントと、エージェントを使える権限が要る。**

| 形 | 中身 | 問題 |
|---|---|---|
| A. 利用者ごとのサインイン | CCP の利用者が、Microsoft にサインインする。層は、その人のトークンでエージェントを呼ぶ | CCP の画面にサインインの流れを足す必要がある(CCP の作りが大きく変わる)。利用者全員に Microsoft のアカウントと Copilot Studio を使う権限が要る |
| B. 共用のアカウント | 層が、AI 用の 1 つのアカウントでサインインしたトークンを持ち、それで呼ぶ | 人のアカウントを機械に使わせる形で、組織の決まりに触れやすい。多要素認証・パスワードの期限でトークンが切れ、人がサインインし直す必要がある。だれが使ったかが残らない |
| C. 方式 1 を使う | Direct Line で、鍵だけで呼ぶ(8・9 章) | エージェントを「認証なし + 鍵を必須」にする。鍵の管理が要る |

### 12.3 試すときの段取り

1. Entra に、公開クライアントのアプリを登録する(12.1 の権限)。テナント ID・アプリ ID はリポジトリの外のファイルに置く。
2. エージェントを公開する(5 章)。
3. 測るプログラム(12.4)に設定を入れて動かす。最初の 1 回だけブラウザが開くので、人がサインインして承諾する。
4. 表(`results/<日時>_<方式>_<モデル>.md`)を 10.1 に写す。

### 12.4 測るプログラム(リポジトリの外に置く)

Microsoft のサンプル `microsoft/Agents` の `samples/nodejs/copilotstudio-client` を元にした、Node(22 以上)のプログラム。7 章の T1〜T6 を送り、秒数と答えの形を表に書き出す。方式 1(Direct Line)と方式 2(Agents SDK)の両方で送れる。

| ファイル | 中身 |
|---|---|
| `%USERPROFILE%\.ccp\ms-verify\measure.mjs` | 送って測る本体 |
| `%USERPROFILE%\.ccp\ms-verify\tests.mjs` | T1〜T6 の頼みと、決まりの確かめ(7 章と同じ中身。直すときは両方) |
| `%USERPROFILE%\.ccp\ms-verify\check-token-endpoint.mjs` | 鍵なしの入口で断られるかを確かめる(8 章) |
| `%USERPROFILE%\.ccp\ms-verify\package.json` | 使う部品(`@microsoft/agents-copilotstudio-client`・`@microsoft/agents-activity`・`@azure/msal-node`・`open`) |
| `%USERPROFILE%\.ccp\ms-verify\images\` | T6 の写真 |
| `%USERPROFILE%\.ccp\ms-verify.env` | 設定(下)。リポジトリに入れない |
| `%USERPROFILE%\.ccp\ms-verify\.token-cache.json` | 方式 2 のサインインのトークン(プログラムが作る)。消すと、次はサインインし直し |
| `%USERPROFILE%\.ccp\ms-verify\results\` | 測った表(`<日時>_<方式>_<モデル>.md`)と、答えの全文(同じ名前の `.json`) |

設定(`ms-verify.env`):

```text
COPILOT_ENVIRONMENT_ID=<環境の ID>          # 方式 2。エージェントの「設定 → 詳細 → メタデータ」
COPILOT_AGENT_SCHEMA_NAME=<スキーマ名>       # 方式 2。同じ所
TENANT_ID=<テナント ID>                     # 方式 2。Entra のアプリの登録の「概要」
APP_CLIENT_ID=<アプリ(クライアント)ID>     # 方式 2。同じ所
MODEL_LABEL=<モデルの名前>                  # エージェントの「概要」→「モデル」で選んだもの(記録に書く)
DIRECT_LINE_SECRET=<シークレット 1>          # 方式 1。「Web チャネルのセキュリティ」
DIRECT_LINE_ENDPOINT=<窓口>                 # 方式 1。なくてよい(既定の窓口)
COPILOT_TOKEN_ENDPOINT=<URL>                # 鍵なしの入口の確かめ。同じ環境のホストとスキーマ名が入った URL
```

動かし方:

```powershell
cd $env:USERPROFILE\.ccp\ms-verify
npm install
node measure.mjs --self-test                 # つながずに、確かめの仕組みだけを試す
node measure.mjs --runs 1                    # 方式 2 で T1〜T5 を 1 回ずつ。最初の 1 回だけブラウザが開く
node measure.mjs --via dl --runs 1           # 方式 1(Direct Line)で T1〜T5 を 1 回ずつ。サインインしない
node measure.mjs --via dl --only T6 --image images\t6.png   # T6 を、画像を付けて送る(png・jpeg・webp)
node measure.mjs --only T3 --runs 5          # T3 だけ 5 回
node measure.mjs --model "<別のモデルの名前>"   # エージェントのモデルを替えたあと。MODEL_LABEL より優先
node check-token-endpoint.mjs                # 鍵なしの入口で断られるか(8 章)
```

- 頼みごとに新しい会話を始める(CCP の呼び出しは 1 回ずつ独立しているため)。会話を始める秒数は、別の列に書く。
- 秒数は 4 つ: 会話を始めるまで・最初に何かが届くまで(入力中の印など)・本文が届くまで・終わりまで。
- モデルの名前は、つなぎ方からは分からないので、設定か `--model` で渡す。渡さないと止まる。
- 鍵・トークン・ID・URL は画面に出さない(つまずきの理由も 200 文字までにし、ID は伏せる)。

### 12.5 疎通を先に確かめる

全部を測る前に、1 回だけ届くかを確かめる(2026-10-30 利用者)。

```powershell
node measure.mjs --only T1 --runs 1            # 方式 2
node measure.mjs --via dl --only T1 --runs 1   # 方式 1
```

### 12.6 つまずき: 「GitHub Copilot harness」のエージェントは SDK から呼べない

2026-10-30、T1 を送ると、サインイン・つなぎは通ったが、エージェントから「This action doesn't support agents built with the GitHub Copilot harness.」とだけ返った(0.4 秒。頼みは処理されていない)。

- Copilot Studio のエージェントには「ハーネス」(エージェントを動かす仕組み)がある。**新しい画面のいちばん上の「エージェント [GitHub Copilot]」で作ると、GitHub Copilot ハーネスになる**。もう 1 つは、以前からある **標準(standard)のハーネス**(「Other ways to build」の「エージェント [標準]」)。
  - GitHub Copilot ハーネス: 目標を受けて手順を組み、ツールを使い分ける、重い仕事向け。名前に GitHub Copilot とあるが、GitHub Copilot のサービスにデータは行かない。
  - 標準のハーネス: 決まった話題・頼みに、決まった形で答える向け。チャネル・つなぎ方は、こちらのほうが揃っている。
- Microsoft Learn に書かれているのは、Power Automate の Copilot Studio のつなぎが GitHub Copilot ハーネスに対応していないこと。**Agents SDK も、試したとおり対応していない。**
- **標準のハーネスで作り直したエージェントは、Agents SDK からも Direct Line からも呼べた。** ハーネスを後から切り替える方法は、文書では見つからなかった(Microsoft は「移すのは作り直し」としている)。
- 標準のハーネスで選べるモデル: GPT Chat Latest・GPT-5.5 Chat・GPT-5 Chat・GPT-4.1・GPT-5 Auto / Reasoning(プレビュー)・Claude Sonnet 4.6・Opus 4.6〜4.8。固定の GPT のモデルは 2026-10-31〜11-12 に終わり、GPT Chat Latest に移されるので、**GPT Chat Latest** を選ぶ。中身の版は知らないうちに新しくなるので、測った日を記録に残す。GitHub Copilot ハーネスとは選べるモデルが違う(GPT 6.1 Sol などは標準にはない)。

出典: Microsoft Learn「Call a Copilot Studio agent from Power Automate」・「Harnesses overview」・「Choose a harness」・「Access standard harness agents and agent flows」・「Select a primary AI model for your agent」(Copilot Studio)。

## 13. 確かめること: 会話の記録(未確認)

- Copilot Studio は、会話の記録を環境(Dataverse)に残すとされる。CCP の頼みには、配信の企画の中身(テーマ・商品の名前・在庫など)が入る。
- 確かめること: どこに・どれだけの期間残るか、だれが見られるか、残さない設定ができるか。方式 1 では、記録の上の利用者はすべて層の名前になる。

## 14. 確かめること: データの地域とモデル(未確認)

Copilot Studio では、Microsoft の GPT のほかに、Anthropic などの外のモデルも選べる。下は 2026-10-29 に Microsoft Learn を読んだ内容で、**利用先の組織の契約と設定では、まだ確かめていない**。使う前に、組織の管理者と、データの扱いの担当に確かめる。

| 確かめること | 文書に書かれていたこと |
|---|---|
| GPT Chat Latest の地域 | 日本では「cross-geo」(**日本の外で処理されることがある**)。地域をまたぐデータの移動は、管理者が切り替える |
| Anthropic のモデルを使えるようにする設定 | 管理者が 2 か所で許す: Power Platform の管理センターで、環境(または環境のグループ)に外のモデルを許す。Microsoft 365 の管理センターで、Anthropic を許す(Microsoft の「サブプロセッサ」として) |
| Anthropic のモデルの行き先 | 日本を含む多くの地域で「cross-geo」。EU のデータ境界の約束からも外れる |
| 契約の条件 | いまは、Anthropic は Microsoft のサブプロセッサとして、Microsoft の製品の条件とデータ保護の付属書に従う、とされる。以前の文書では「Microsoft の契約が及ばない(独立した処理者)」とされていた(2026-05 に変わった)。古い文書と新しい文書が混ざっているので、最新のものを確かめる |
| 既定のモデル | 「既定」のモデルは、新しいモデルが出るたびに替わる。選んだモデルが使えなくなったときも、既定に戻って動く(知らないうちにモデルが替わることがある) |
| 試験中・プレビューのモデル | 本番に使わない。データが組織の地域の外で処理・保存されることがある |

- Anthropic のモデルを使うと、CCP の頼みの中身が Microsoft の外の会社で処理される扱いになりうる。使うかどうかは、利用先の組織が決める。
- 検証の環境で、GitHub Copilot ハーネスの既定が Claude になっていたのは、その環境で外のモデルがすでに許されていたためと考えられる(未確認)。

出典: Microsoft Learn「Select a primary AI model for your agent」(Copilot Studio)・「Choose an external model as the primary AI model」・「Allow external language models for generative responses」(Power Platform)・「Copilot in Microsoft 365 apps with Anthropic models」。
