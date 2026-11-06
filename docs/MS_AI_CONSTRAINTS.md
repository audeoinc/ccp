# Copilot をモデルとして使うときの制約を調べる手順(利用先の Claude 向け)

2026-11-06 作成。**この文書を渡された Claude は、この文書だけで作業を進められる。** CCP の AI を Copilot Studio・Power Platform で動かすための形(パターン)が 9 つあり、開発側で検証した。利用先の Microsoft の組織(テナント)で、それぞれの形を実装できるかを `pac` CLI で調べ、**パターン × 制約の表と、インフラチームに渡す確認事項の一覧**を作る(形は 7 章)。

実装はしない。結論(どの形にするか)も決めない。決めるのは人とインフラチーム。

## 0. 守ること(最初に読む)

1. **読み取りだけ。環境を変えない。** 使ってよいのは 3 章以降に書いたコマンドと、その `help` だけ。書いていないコマンドを使うときは、先に人に確認する。エージェント・流れ・接続・ポリシー・設定を作らない、変えない、消さない。画面での操作も、人に頼む。
2. **認証は人が行う。** Claude はパスワード・シークレットを入力しない。`pac auth create` は人に頼み(ブラウザが開く)、`--password`・`--clientSecret` は使わない。
3. **秘密を結果に残さない。** テナント ID、環境の ID と URL、メールアドレス、人の名前、鍵、トークン、流れの URL(署名の鍵が入っている)、会話の中身を、結果の文書に書かない。環境は「CCP の環境」「環境 A」、人は役割で書く。コマンドの生の出力は結果の文書に貼らず、読み取った事実だけを書く。ポリシーの名前は、インフラチームが探すのに要るので、利用先の中で使う結果には書いてよい。**開発側に渡すときは、ポリシーの名前も伏せる。**
4. **結果はリポジトリの外に置く。** Git に入れない。一時のファイルも CCP のフォルダの中に作らない。
5. **分からないことを「問題なし」と書かない。** 権限がなくて読めない、出力の形が違う、コマンドがないときは「不明(?)」とし、インフラチームへの確認事項にする。
6. **クレジットを使うことをしない。** エージェントや AI を呼ばない(テストの欄も 1 回ごとにクレジットを使う)。

### 使ってはいけないコマンド

| コマンド | 理由 |
|---|---|
| `pac auth token` | トークンが画面に出る |
| `pac admin create-service-principal` | アプリを作り、シークレットが平文で出る |
| `pac copilot quarantine` | **読むコマンドに見えるが、`--status` の既定が true で、エージェントを隔離する。** 読むときは `pac copilot-studio get-bot-quarantine-status` |
| `pac copilot model predict` | AI を呼ぶ(クレジットを使う) |
| `pac copilot-studio run-maker-evaluation-test-set`・`generate-licensing-report` | 実行やレポートの作成が始まる |
| `pac copilot extract-template` | いまのフォルダにもファイルを作る(検証で確認) |
| `pac admin self-elevate`・`assign-user`・`assign-group` | 権限が変わる |
| `create`・`update`・`delete`・`set`・`patch`・`add`・`remove`・`reset`・`publish`・`push`・`upsert` を含むもの | 環境が変わる |
| `pac env fetch` で `conversationtranscript` を読む | 会話の中身が入っている |
| `pac licensing get-tenant-users` など、人ごとの消費を読むもの | 個人の情報で、この調査には要らない |

## 1. 背景: CCP は何を求めているか

CCP のサーバーは、AI を外の「層」(CCP の外に置く小さなプログラム)に頼める。層が Microsoft の AI を呼ぶ。だから次の 5 つが、形を選ぶ物差しになる。

| 物差し | 中身 | 重み |
|---|---|---|
| 人のサインインなしに、サーバーから呼べる | CCP の利用者に、Microsoft のサインインを増やさない | **必須**(人が別に決めれば変わる) |
| 写真の枚数が毎回変わる | 1〜8 枚。CCP は 1 枚 15MB まで受け付ける | 高 |
| 頼みの文が増え、変わる | 機能を足すたびに変わる | 高 |
| 同時に何本も呼ぶ | 「AI で下書き」1 回で 6〜9 回、4 本ずつ並べる | 中 |
| 長い文を送る | 「？ 聞く」は資料を付ける。サーバーは 40 万字まで受ける(相手の上限は未確認) | 中 |

頼みの中身には、配信の企画(テーマ・商品の名前・在庫など)と商品の写真が入る。

## 2. パターンの一覧

検証の資料にあるものをすべて挙げた。「確か」は開発側で試して確認したこと、「案」は試していないこと。**結果は開発側の環境でのもので、利用先で同じとは限らない。**

| ID | 形 | 検証の結果 | 人のサインイン | 開発側の評価 |
|---|---|---|---|---|
| **P1** | Direct Line + 標準のハーネス。エージェントは「認証なし」+「セキュリティで保護されたアクセスを要求する」(鍵が必須) | **使える**(確か)。文・画像とも JSON と決まりがすべて ○。本文まで 3.0〜4.6 秒。1 回の送信は 4MB まで | 要らない | **最も有力** |
| P1g | Direct Line + GitHub Copilot ハーネス。認証は P1 と同じ | 呼べる(確か)。標準の 2 倍ほど遅い(文で 5.3〜10.9 秒) | 要らない | 標準を作れないときの代わり |
| P2 | Agents SDK + 標準のハーネス。利用者ごとにサインイン | 動く(確か)。アプリだけの認証は対応していない | **要る(全員)** | 外す |
| P2s | Agents SDK + 共用のアカウント 1 つ | 案。試していない | 機械が人のアカウントを使う | 組織の決まりに触れやすい |
| P2g | Agents SDK + GitHub Copilot ハーネス | **呼べない**(確か。「This action doesn't support agents built with the GitHub Copilot harness.」) | — | 行き止まり |
| P3 | AI Builder のプロンプトを、Dataverse の `Predict` で直接呼ぶ(アプリだけの認証) | **呼べなかった**。500「Source is null」(原因は推測: 外のプログラムから呼ばれる前提でない) | 要らない | 行き止まり(推測) |
| **P4** | AI Builder のプロンプトを、Power Automate の流れから呼ぶ。入口は「HTTP 要求の受信時」(署名入りの URL) | **使える**(確か)。文は 2.4〜6.7 秒。画像は 8 枚まで(空の欄は断られ、層が白い画像で埋める)。英語の文字数の決まりは外れた(1 回の測定) | 要らない | **次点** |
| P5 | Direct Line + 認証あり。会話の中で利用者のトークンを渡す | 案。試していない | **要る**(見込み) | P1 が止められたときの案 |
| P6 | P4 の入口を Entra ID の認証つきにする。層はアプリの券で呼ぶ | 案。**アプリだけの券で呼べるかは未確認** | 要らない(見込み) | P1・P4 の署名 URL が止められたときの案 |

**資料にない・調べないもの**: Azure OpenAI(Microsoft Foundry)は想定しないと開発側で決めている。Microsoft 365 Copilot はアプリから呼ぶ先ではない。Copilot Studio のエージェントを Power Automate の流れから呼ぶ形は、資料に試した記録がない。これらの形についての調査はしない。聞かれたら人に回す。

**検証で実際に当たった制約**: 開発側とは別の組織の開発環境で、**エージェントの認証の「認証なし」がグレーアウトし、組織のポリシーで設定できないと出た**(2026-11-05、画面で確認)。原因は DLP と見込むが、確認できていない。P1 と P1g はこれで止まる。**まずここを確認する**(4.3 の D2)。

## 3. 準備

PowerShell で行う(Git Bash からは `pac` が見えないことが多い)。

```powershell
pac help                # Version: が出れば入っている
pac auth list           # サインイン済みか。値を結果に書かない
pac auth who            # いま選ばれているアカウントとテナント
```

- **`pac` がなければ、人に入れてもらう**(`winget install --id Microsoft.PowerAppsCLI -e` → `pac install latest`)。PC を変えるので、Claude は勝手に入れない。
- **サインインがなければ、人に `pac auth create` を頼む。** 人に確認すること: 正しいテナントか。そのアカウントは Power Platform の管理者か、作る人(環境の作成者)か。
- **権限で結果が変わる。** `pac admin`・`pac governance`・`pac licensing` の多くは、管理者でないと断られる見込み。断られたら「不明」とし、インフラチームに頼む(そのコマンドの実行を頼んでもよい)。管理者の権限を自分に足そうとしない。
- コマンドは pac 2.14.1 の help と Microsoft Learn で確認した。**(Preview)の付くコマンドは、版で変わる。** 手元で動かなければ `pac <コマンド> help` を見て合わせる。**開発側では、利用先のような本物のテナントでこの手順を通しておらず、出力の形は未確認**(4・5 章の読み方は、列や値の名前が違えば読み替える)。

CCP に使う環境を人に聞く(なければ「未定」と書き、6 章の依頼に入れる)。ID は変数に入れて使い、結果に書かない。

```powershell
pac env list                       # Dataverse のある環境
pac admin list                     # テナントのすべての環境(管理者)
$e = '<人が選んだ環境の ID>'
```

## 4. 共通の確認

どのパターンにも関わる。**結果は E1 などの ID で 7 章の表に書く。**

### 4.1 環境

| ID | 調べること | コマンド | 読み方 | 制約だったら |
|---|---|---|---|---|
| E1 | 環境の種類 | `pac admin list --environment $e` | Type の列。**Default は避ける**(会社全体の環境)。Developer は検証だけ、運用には Production か Sandbox がよい | Power Platform 管理者に、CCP 用の環境を頼む |
| E2 | Dataverse があるか | `pac env who --environment $e` | 組織の情報が出ればある。P1〜P6 すべてに要る | 同上(Dataverse つきで) |
| E3 | 地域 | `pac environment-management get-environment-by-id-for-user --environment $e` | 地域(location)の項目。項目が見つからなければ不明 | 6 章の R1 |
| E4 | 管理された環境か | 同上の出力の governance の項目 | 管理された環境なら、共有の制限などがかかる場合がある | 影響をインフラチームに聞く |
| E5 | 環境のグループとルール | `pac admin list-groups`、`pac governance list-rule-assignments-by-environment-id --environment $e --include-rule-set-counts`、`pac governance list-rule-based-policies` | CCP の環境にルールが当たっているか。**DLP のほかに、ここで Copilot の設定が止められていることがある**(見込み) | ルールの名前と中身をインフラチームに聞く |
| E6 | テナントの設定 | `pac admin list-tenant-settings` | 出力から `copilot`・`intelligence`・`bot`・`agent`・`ai` を含むキーを探す。別のファイルに書き出す `--settings-file` は使わない。どのキーが何を止めるかは、資料では確認していない。意味が分からないキーは「不明」とする | 値の意味をインフラチームに聞く |
| E7 | 環境の設定 | `pac env list-settings --environment $e --filter copilot`(`--filter` を `bot`・`ai`・`transcript` に変えて流す) | 関係のありそうな行だけを読む。出なければ「不明」 | 同上 |

### 4.2 クレジットとライセンス

| ID | 調べること | コマンド | 読み方 | 制約だったら |
|---|---|---|---|---|
| L1 | 環境の Copilot のクレジット | `pac licensing get-environment-billing-policy --environment $e`、`pac licensing get-allocations-by-environment --environment $e`、`pac licensing get-currency-allocation-by-environment --environment $e` | 課金プランがつながっているか、Copilot のクレジットの割り当てがあるか。**どちらもなければ、テストの欄でも「This environment is out of credits」(EnforcementUsageCredits)で止まる。Developer の環境でも要る**(確か) | Power Platform 管理者に、割り当てか課金プランのつなぎを頼む。見積もり: Direct Line は 1 回約 1 クレジット(測った値)。AI Builder はトークンの量で払い、画像 1 枚の頼みで 3(測った値) |
| L2 | テナントの容量 | `pac licensing get-tenant-capacity-details`、`pac licensing list-billing-policies` | 組織に割り当てられる容量があるか | 買うかどうかを、ライセンスの担当に聞く |
| L3 | Copilot Studio を作る人のライセンス | pac では確認できない | — | 6 章の I1 |

### 4.3 DLP(データ損失防止)

Copilot Studio の DLP は、2025 年初めからすべてのテナントで効く。**エージェントごとの例外はもうない**(Microsoft Learn)。例外にするなら環境の単位になる。

```powershell
pac admin dlp-policy list                            # 一覧。管理者の権限が要る見込み
pac admin dlp-policy show --policy-name <ポリシーの ID>   # 1 つずつ中身を見る
```

読み方:

1. **CCP の環境に当たるポリシーを、すべて選ぶ。** テナント全体・除外あり・環境を指定、の 3 つの形がある。**複数が当たれば、いちばん厳しい扱いになる。**
2. 各ポリシーで、下の接続がどのグループにあるかを読む。画面の名前は Business / Non-business / Blocked。出力では別の名前のことがある(Confidential / General / Blocked など。見込み)。
3. **書かれていない接続は、そのポリシーの既定のグループに入る。** 既定のグループも読む。Direct Line と「認証なしのチャット」は、多くの場合 Non-business に入る。**Non-business を自動で止めている組織が多い**(Microsoft Learn)。
4. **一緒に使う接続は、同じグループに入っている必要がある**(違うグループの間ではデータを渡せない)。P4 の HTTP と Dataverse などを見比べる。

名前で探す接続(版で変わることがある。見つからなければ「不明」):

| ID | 接続(管理センターの名前) | 止まると | 関わるパターン |
|---|---|---|---|
| **D2** | **Chat without Microsoft Entra ID authentication in Copilot Studio** | **「認証なし」を選べない・公開できない** | P1・P1g |
| D3 | Direct Line channels in Copilot Studio | Direct Line に公開できない | P1・P1g・P5 |
| D4 | 流れの入口「When a HTTP request is received」にあたる接続(`HTTP`・`request` で探す) | 流れの入口を作れない | P4・P6 |
| D5 | Microsoft Dataverse(AI Builder のプロンプトの実行) | プロンプトを実行できない | P4・P6 |
| D6 | HTTP with Microsoft Entra ID など、D4 と同じグループにすべき接続 | グループ違いで流れが止まる | P4・P6 |

D2 が止まっているときの画面の出方(Microsoft Learn): 「認証なし」が選べず、理由が表示される。すでに認証なしのエージェントなら、チャネルの画面にエラーの帯が出て「公開」が押せない。帯の Details からファイルをダウンロードすると、ポリシー違反の行が読める(人に頼む)。

### 4.4 エージェントがすでにあるとき

```powershell
pac copilot list --environment $e
pac env fetch --environment $e --xml "<fetch top='50'><entity name='bot'><attribute name='name'/><attribute name='schemaname'/><attribute name='authenticationmode'/><attribute name='accesscontrolpolicy'/><attribute name='publishedon'/><attribute name='statecode'/></entity></fetch>"
pac copilot-studio get-bot-quarantine-status --environment $e --bot-id <ボットの ID>
```

| 列 | 読み方 |
|---|---|
| `authenticationmode` | 0 未指定 / **1 なし** / 2 Microsoft(統合) / 3 Entra ID の手動 / 4 OAuth2。P1 は 1 |
| `publishedon` | 最後に公開した日時。**空なら未公開。** `pac copilot list` の `Published` は、画面の「公開」とは別のもの(下書きでも出た。検証で確認) |
| `accesscontrolpolicy` | 0 だれでも / 1 エージェントの読み手 / 2 グループ / 3 だれでも(複数テナント) |

- `pac copilot status` は、pac 2.14.1 ではエラーで止まった(検証)。使わない。
- ハーネスの種類と、「セキュリティで保護されたアクセスを要求する」の状態は、pac で読む方法を確認できていない。**画面で人に見てもらう**(6 章の H1)。
- `pac copilot list` が空なら「まだない」と書く。作らない。

### 4.5 サーバーからの通信(pac ではない)

**`pac` を動かす PC と、層を動かすサーバーは別のことがある。** 通信の確認は、**サーバーの上で**行う(サーバーに入れないなら、インフラチームに頼む)。何も送らず、届くかだけを見る。

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 15 https://directline.botframework.com/
```

HTTP の番号が返れば(404 などでも)、届いている。時間切れ・接続の失敗なら届いていない。中継(プロキシ)が要るかも書く。

## 5. パターンごとの確認

「必要なもの」のうち、4 章の ID があるものは、そこで調べた結果を使う。**どのパターンにも E1・E2・L1 が要るので、下の表では省く。**

### 5.1 P1 Direct Line + 標準のハーネス(本命)

| 必要なもの | 確認 | ○ の条件 | 制約なら、だれに何を |
|---|---|---|---|
| 認証なしを選べる | **D2**(4.3)、E5、H1 | 止められていない | **Power Platform 管理者に**: CCP の環境だけ認証なしのチャットを許す(案は下) |
| Direct Line に公開できる | D3 | 止められていない | 同上 |
| D2 と D3 が同じグループ | 4.3 の読み方の 4 | 同じ | 同上 |
| エージェントを作り、公開する権限 | I2 | 環境の作成者のロールがある | 管理者に権限を頼む |
| 外への通信 | 4.5 | `directline.botframework.com` に 443 で届く | ネットワークの担当に許可を頼む |
| 鍵の置き場 | I5 | サーバーの秘密の置き場がある | サーバーの担当に頼む |
| データの扱い | R1・R2 | 組織の決まりに合う | データの扱いの担当に聞く |

**D2 で止まったときの案**(管理者への相談の材料):

- A. **CCP の環境だけ例外にする**(第一の案)。全体のポリシーから CCP の環境を外し(Exclude certain environments)、環境のポリシーで許す。ほかの環境は変えない。
  - エージェントは鍵を必須にする。鍵なしの入口は 403 で断られる(検証で確認)。**鍵を必須にする設定は、公開して初めて効く。オフだと、URL を知る人が鍵なしで話しかけられる(確認)。**
  - 呼べるのは鍵を持つサーバーだけ。だれが使えるかは CCP の入口のサインインで絞る。
  - エージェントには、ナレッジ・ツール・Web の検索を付けない。頼まれた文に答えるだけ。
- B. P5(認証あり)。利用者にサインインが増える。
- C. P6(流れを Entra ID で呼ぶ)。

### 5.2 P1g Direct Line + GitHub Copilot ハーネス

P1 と同じものが必要で、同じ所で止まる。**P1 が DLP で止まるなら、これも止まる。** 違うのは、作る種類に「エージェント [GitHub Copilot]」があること(H1)と、遅いこと。使うのは、標準のハーネスを作れないときだけ。

### 5.3 P2 Agents SDK + 標準のハーネス

| 必要なもの | 確認 | ○ の条件 | 制約なら、だれに何を |
|---|---|---|---|
| Entra のアプリの登録(公開クライアント、リダイレクトは `http://localhost`) | `pac admin application list`(管理者)、I3 | 登録が許される | Entra の管理者に登録を頼む |
| 権限の承諾: Power Platform API の委任された権限 `CopilotStudio.Copilots.Invoke`、Graph の `User.Read` | I3 | 利用者か管理者が承諾できる | Entra の管理者に承諾を頼む |
| **CCP の利用者全員の Microsoft のアカウント** | I4 | 利用者全員が同じテナントにいる | **人に**: サインインを増やしてよいか(1 章の必須を外すことになる) |
| 利用者がエージェントを使える権限 | 開発側でも未確認(作った本人でしか試していない) | — | インフラチームと一緒に試す |
| 接続先への通信 | I6 | 環境のホストに届く | ネットワークの担当 |

**CCP の作りを大きく変える必要がある**(画面にサインインの流れを足す)。ここで止まらなくても、制約として表に書く。アプリだけの認証が出ていないかを、Microsoft の文書で確認し直す(開発側の確認は 2026-10〜11 月)。

### 5.4 P2s Agents SDK + 共用のアカウント

P2 の必要なものに加えて、機械用の人のアカウントを 1 つ持つ。I7 で聞く。多要素認証・パスワードの期限でトークンが切れ、人がサインインし直す。だれが使ったかも残らない。**組織の決まりで止められると見込んでよいが、決めつけずに聞く。**

### 5.5 P2g と P3(行き止まり)

- **P2g**: 製品の対応の問題で、利用先の設定では直らない(開発側で確認)。表には「×(製品)」と書く。調べない。
- **P3**: 表には「×(検証。原因は推測)」と書く。作って試し直さない。利用先に AI Builder の知識のある人がいれば、「外のプログラムから `Predict` を呼ぶ方法があるか」を聞く(I8)。参考: 読むだけなら `pac copilot model list --environment $e` でプロンプトの一覧が見える。`pac admin list-service-principal` で、Dataverse に入れるアプリが見える。

### 5.6 P4 AI Builder + 流れ(HTTP の入口)

| 必要なもの | 確認 | ○ の条件 | 制約なら、だれに何を |
|---|---|---|---|
| 流れの HTTP の入口と応答 | D4 | 止められていない | **Power Platform 管理者に**: CCP の環境だけ許す |
| プロンプトの実行 | D5 | 止められていない | 同上 |
| 接続が同じグループ | 4.3 の読み方の 4 | 同じ | 同上 |
| **流れのプレミアムのライセンス** | I1。参考に `pac licensing get-user-per-flow-capacity-source-tenant-context-summary`(引数は `help` で確認) | 持ち主に有効なライセンスがある | ライセンスの担当に頼む。HTTP の入口はプレミアムの接続。Developer の環境では案内なしに動いたが、本番では要る見込み(未確認) |
| Copilot のクレジット(AI Builder のクレジットは 2026-11-01 で終わる) | L1 | 割り当てがある | L1 と同じ |
| 署名入りの URL を外から呼べる | I9 | 「すべてのユーザー」の入口を組織が許す | 許されないなら P6 |
| 流れの持ち主 | I10 | 組織で決められる | 持ち主のアカウントが止まると流れも止まる(見込み)。サービス用のアカウントが使えるかを聞く |
| 流れのあるサーバーへの通信 | I6 | 流れの URL に届く | ネットワークの担当。URL は流れを作るまで決まらない |
| 既存の流れの確認(あれば) | `pac power-automate list-cloud-flows --environment $e`(管理者) | — | 出力に URL や人の名前があれば書かない |

**層の側の制約**(インフラではない): 写真は 8 枚まで。足りない欄を白い画像で埋める。分けて呼ぶと、写真どうしを見比べられない。これも表の備考に書く。

### 5.7 P5 Direct Line + 認証あり(案)

P1 の D3 が要る。D2 は要らない。**開発側で試していない。** 利用者のトークンを会話で渡す形は、サーバーだけでは呼べない見込みで、P2 と同じ問題(全員のサインイン)がある。D2 を止めたポリシーの下で「Authenticate manually」の選択肢が使えるかは、画面で見てもらう(一部の手動の認証は使えない、と Microsoft Learn にある)。

### 5.8 P6 流れを Entra ID の認証つきで呼ぶ(案)

P4 の必要なものに加えて:

| 必要なもの | 確認 | ○ の条件 | 制約なら、だれに何を |
|---|---|---|---|
| 入口の「フローをトリガーできるユーザー」で、テナントの中に絞る | I9 | 「テナントのすべてのユーザー」か「テナントの特定のユーザー」を選べる | 管理者に聞く |
| 層が使う Entra のアプリとシークレット(か証明書) | I3 | 登録できる | Entra の管理者に頼む |
| **アプリだけの券で、入口を呼べるか** | **未確認**(開発側で試していない) | 試すまで分からない | 7 章の表には「?」と書く。試すなら人の指示のあと、開発側と一緒に |

## 6. pac で分からないこと(インフラチームへの聞き方)

下の文を、結果に合わせて直して使う。**すでに pac で答えが分かったものは聞かない。** 「なぜ聞くか」は「CCP の AI を Copilot Studio で動かすにあたり、形を決めたいから」と添える。

| ID | 相手 | 聞くこと |
|---|---|---|
| H1 | 作る人(環境に入れる人) | Copilot Studio で CCP の環境を開き、エージェントの「設定 → セキュリティ → 認証」の「認証なし」を選べるかを見てください(選べないとき、表示された理由をそのまま教えてください)。作る種類の画面に「エージェント [標準]」があるかも見てください。**設定は変えないでください** |
| I1 | ライセンスの担当 | Copilot Studio を作る人のライセンスと、Power Automate のプレミアム(HTTP の入口の流れ)のライセンスは、CCP の環境で使えますか。流れの呼び出しの回数の上限は、どのライセンスで決まりますか |
| I2 | Power Platform 管理者 | CCP の環境で、エージェントとプロンプトを作る人に、環境の作成者のロールを出せますか |
| I3 | Entra の管理者 | 公開クライアント(委任の権限)のアプリと、シークレットを持つアプリの登録は許されますか。だれが登録し、だれが承諾しますか |
| I4 | Entra の管理者 | CCP の利用者は全員、同じテナントのアカウントを持っていますか。条件付きアクセスで、CCP のサーバーや利用者の場所から呼ぶことに制限はありますか |
| I5 | サーバーの担当 | Direct Line のシークレット(か流れの URL)を置く秘密の置き場は、どこを使えばよいですか |
| I6 | ネットワークの担当 | CCP のサーバーから、`directline.botframework.com`、Power Platform の環境のホスト、流れの URL に、HTTPS で出られますか。中継は要りますか。IP で許可するなら、Azure のサービスタグの一覧を使ってください(Microsoft の案内) |
| I7 | セキュリティの担当 | サービス用の人のアカウント(共用)でサインインして、機械がトークンを持ち続ける形は許されますか |
| I8 | AI Builder の分かる人 | プロンプトを、流れ・アプリの外のプログラムから `Predict` で呼ぶ方法はありますか(「Source is null」で断られました) |
| I9 | Power Platform 管理者 | 「HTTP 要求の受信時」の流れで、署名入りの URL(だれでも呼べる形)は許されますか。だめなら、テナントの中に絞る形はどうですか |
| I10 | Power Platform 管理者 | 流れの持ち主を、サービス用のアカウントかチームにできますか |
| I11 | Power Platform 管理者 | DLP を読む権限がもらえなければ、CCP の環境に当たるポリシーと、4.3 の D2〜D6 の接続のグループを教えてください |
| I12 | Power Platform 管理者 | **D2 が止まっているなら**: 止めている理由は何ですか。CCP の環境だけ例外にできますか(材料は 5.1 の案 A)。だれが判断しますか |
| I13 | Power Platform 管理者 | 同時に何本呼んでよいか、Copilot Studio の上限(Microsoft Learn の「Quotas and limits」)をこの環境で超えそうなときの扱いを教えてください |
| R1 | データの扱いの担当 | 頼みの中身(配信の企画・商品の写真)が、環境の地域の外で処理されてよいですか。**GPT Chat Latest は、日本では日本の外で処理されることがあります**(cross-geo。検証時の Microsoft Learn)。地域をまたぐ移動の設定は、いまどうなっていますか |
| R2 | データの扱いの担当 | 会話の記録を残してよいですか。Microsoft Learn によると、記録は Dataverse の表 `ConversationTranscript` に既定で 30 日、Copilot Studio の保管場所に最大 28 日残ります(Developer の環境では残りません)。管理センターに、Dataverse に残さない設定があります。層の形では、利用者はすべて層の名前になります |
| R3 | データの扱いの担当 | Anthropic などの外のモデルを、組織は許していますか(管理者が 2 か所で許す。Power Platform の管理センターと Microsoft 365 の管理センター)。**使わないなら、モデルは GPT Chat Latest をはっきり選びます**(既定のモデルは替わる) |

## 7. 出す結果

次の 3 つを、1 つの md にする。ファイルは Git の外に置き、置いた場所を人に伝える。

### 7.1 パターン × 制約の表

記号: ○ 問題なし(根拠あり) / × 止まる / △ 条件つき / **? 不明** / — 関係なし。**pac で読めず、人にも確認できていないものは ? にする。**

```markdown
| パターン | 環境 E1・E2 | クレジット L1 | ルール E5・E6 | 認証なし D2 | Direct Line D3 | HTTP の入口 D4 | Dataverse D5 | グループ | ライセンス I1 | Entra I3・I4 | 通信 4.5・I6 | データ R1〜R3 | 判定 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P1 | | | | | | — | — | | | — | | | |
| P1g | | | | | | — | — | | | — | | | |
| P2 | | | | — | — | — | — | — | | | | | |
| P2s | | | | — | — | — | — | — | | | | | |
| P2g | — | — | — | — | — | — | — | — | — | — | — | — | ×(製品) |
| P3 | — | — | — | — | — | — | — | — | — | — | — | — | ×(検証・推測) |
| P4 | | | | — | — | | | | | — | | | |
| P5 | | | | — | | — | — | — | | | | | |
| P6 | | | | — | — | | | | | | | | |
```

判定は「実装できる」「○○ が解ければ実装できる」「実装できない」「不明」のどれか。

### 7.2 制約の一覧(× と △ と ?)

```markdown
| # | 制約 | 止まるパターン | 分かった根拠(コマンドの名前か、人の確認。生の出力は貼らない) | 確かさ(確認 / 見込み / 不明) | どうすればよいか(案) | 頼む相手 |
```

### 7.3 インフラチームに渡す確認事項

6 章から、**まだ答えが分からないものだけ**を選ぶ。**止まっているパターンを動かすのに効くものから順に**並べる(まず D2)。

```markdown
| # | 相手 | 聞くこと(そのまま送れる文) | なぜ | 関係するパターン | 答えで変わること | 回答 |
```

最後に、1 段落で次を書く: いまの時点で動かせそうなパターン、動かすのにいちばん効く 1 つの確認、不明のまま残ったもの。**推薦は書いてよいが、決めるのは人。**

## 8. この文書の確かさ

| こと | 確かさ |
|---|---|
| パターンの一覧・結果の数字 | 開発側の検証の記録から写した(`docs/MS_AI_VERIFY.md`・`docs/MS_AI_SETUP.md`。手元にあれば、細かい作り方はそこにある) |
| pac のコマンドの名前と引数 | pac 2.14.1 の `help` と Microsoft Learn で確認した |
| コマンドの出力の形・必要な権限 | **未確認**(利用先のようなテナントでは流していない) |
| DLP の接続の名前と効き方、`bot` の表の列と値 | Microsoft Learn で確認した(2026-11-06)。D4〜D6 の接続の名前は、資料では確認できていない |
| 「認証なし」のグレーアウトの原因が DLP であること | **見込み**(別の組織の画面で見たのは、グレーアウトとポリシーの表示まで) |

出典(Microsoft Learn): 「Configure data policies for agents」・「Microsoft Power Platform CLI admin command group」・「Agent (bot) table/entity reference」・「Add OAuth authentication for HTTP request triggers」・「Develop a custom analytics strategy」・「Power Platform URLs and IP address ranges」・「Quotas and limits」(Copilot Studio)。
