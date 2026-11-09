# Copilot Studio のエージェントと DLP(データポリシー)— Direct Line と Agents SDK が止まる条件

2026-11-09 の検証の記録です。環境 B で、Agents SDK からエージェントを呼ぶと、接続はできるのに返事の代わりに `DataLossPreventionViolation` が返りました。どのコネクタが止めているか、どう直せばよいかを、環境 A でポリシーを切り替えて確かめました。

- 環境 A・環境 B の呼び方と、これまでの差は [MS_AI_SETUP.md](MS_AI_SETUP.md) の 8 章にあります。
- 検証の道具と、測った数字の記録は [MS_AI_VERIFY.md](MS_AI_VERIFY.md) にあります。
- 確かさの書き方は 4 つです。**実測**は環境 A で試した結果、**明記**は Microsoft の文書に書いてあること、**推測**は結果や文書から推し量ったこと、**未確認**はまだ確かめていないことです。

## 1. 結論

| 項目 | 結論 | 確かさ |
|---|---|---|
| 環境 B の SDK のエラーの原因 | データポリシーで、コネクタ「**Direct Line channels in Copilot Studio**」がブロックされていること。環境 A でこのコネクタだけをブロックすると、同じ形(接続はでき、返事が `DataLossPreventionViolation`)になった | 実測からの強い見込み |
| 直し方 | CCP の環境だけ、このコネクタの**ブロックを外す**(ビジネス・非ビジネスのどちらに置いてもよい) | 実測 |
| エージェントの認証 | 「Microsoft で認証する」のままでよい。「手動で認証する」に変えなくてよい | 実測 |
| CCP からの呼び方 | 組織がサインインなしの会話を許さない環境では、**Agents SDK** が合う。頼むことが 1 つで済み、サインインした利用者だけが使う形になる | 実測 + 判断 |

## 2. 確かめた問いと答え

| 問い | 答え | 根拠 | 確かさ |
|---|---|---|---|
| 1. Agents SDK の呼び出しは「Direct Line channels in Copilot Studio」に数えられるか | **数えられる** | このコネクタだけをブロックすると、SDK も止まった(3 章の S1)。文書には書いていない。DLP の文書は、このコネクタの対象を「デモ用サイト・独自のサイト・モバイルアプリ・ほかの Direct Line チャネル」とし、SDK の名前を出さない | 実測 |
| 2. Business に移すか、ブロックを外すだけか | **ブロックを外すだけで通る**。SDK は、このコネクタだけビジネスに置いてほかと箱が分かれても通る | S0'・S2a・S2b | 実測 |
| 3. エージェントの認証は「Microsoft で認証する」のままでよいか | **よい** | Microsoft 認証で公開したエージェントを、SDK で呼べた(S0'・S2a・S2b)。SDK の文書にも「SDK を使うためだけに、認証なしを選ぶ必要はない」とある | 実測 + 明記 |
| 4. Power Automate で「Execute Agent and wait」が出ないのは、「Microsoft Copilot Studio」コネクタのブロックが原因か | 分からない。DLP の文書には、ブロックされたコネクタは「保存できず、エラーが出る」とあり、デザイナーから消えるとは書いていない。GitHub Copilot ハーネスのエージェントと、未公開のエージェントは選べない、という別の原因もある | 文書 | 未確認(試していない) |

## 3. 環境 A での結果

- エージェントは標準のハーネスのもの 1 つです。頼みは T1(部品の文言の言い換え)を 1 回送り、返事が届くか、エラーが返るかまでを見ました。
- Direct Line はシークレットで呼びます(サインインなし)。SDK は、委任の権限 `CopilotStudio.Copilots.Invoke` を持つアプリ登録で、利用者がサインインして呼びます。
- 検証用のポリシーは、テナントのすべての環境を対象に作り、切り替えました。

| 段 | DLP の設定(効いているポリシーを合わせた形) | 公開済みの版の認証 | Direct Line(シークレット) | Agents SDK(Entra のサインイン) |
|---|---|---|---|---|
| S0 | 全部 非ビジネス | 認証なし | 通る | 通る |
| S1 | Direct Line channels を**ブロック** | 認証なし | **止まる** | **止まる** |
| S2a | Direct Line channels だけ**ビジネス**、Chat without Microsoft Entra ID authentication ほかは非ビジネス | Microsoft 認証 | **止まる** | 通る |
| S2b | Direct Line channels と Chat without Microsoft Entra ID authentication を**両方ビジネス**、ほかは非ビジネス | Microsoft 認証 | 通る | 通る |
| S0' | 全部 非ビジネス | Microsoft 認証 | 通る | 通る |

止まるときは、どれも同じ形でした。

- トークンと会話は作れる。返事の代わりに「申し訳ありません。予期しないエラーが発生しました。… エラー コード: DataLossPreventionViolation」が返る。
- 裏の知らせ(trace)も `ErrorCode: DataLossPreventionViolation` だけで、**どのコネクタ・どのポリシーで止めたかは出ない**。
- ポリシーを変えてから効くまでは、数分だった(文書では、ふつう 1 時間以内、長いと 24 時間)。

## 4. 結果から分かった仕組み

| 点 | 中身 | 確かさ |
|---|---|---|
| SDK が使うコネクタ | Direct Line channels だけ。「Chat without Microsoft Entra ID authentication」は使わない(S2a で、箱が分かれていても通った) | 実測からの推測 |
| Direct Line のシークレットが使うコネクタ | Direct Line channels と「Chat without Microsoft Entra ID authentication」の両方。エージェントが Microsoft 認証でも、シークレットの会話はサインインなしだから(S2a で止まり、S2b で通った) | 実測からの推測 |
| Microsoft 認証のエージェントと Direct Line のシークレット | DLP に当たらなければ、サインインなしでも返事が来た(S0'・S2b)。ただし今回のエージェントは、利用者の情報を使わない単純なもの。利用者の情報を使うトピックがあると、サインインを求められたり断られたりする見込み | 実測(単純なエージェント)+ 推測 |
| 複数のポリシーが効くとき | 1 つずつ判定し、どれかで違反なら止まる。優先の順はない。ブロックは、どれか 1 つにあれば効く | 実測 + 文書の趣旨 |
| ビジネスと非ビジネス | 使ってよい・悪いの区別ではなく、**混ぜてはいけない 2 つの箱**。1 つのエージェント・流れ・アプリが一緒に使うコネクタは、同じ箱でないと違反になる。使えないのはブロックだけ | 明記 |
| 新しいコネクタの既定の箱 | Copilot Studio のチャネルのコネクタなど、2019 年より後のものは、ふつう非ビジネスに入る。組織によっては、非ビジネスをまとめてブロックしている | 明記 |

## 5. 環境 B の前の結果の見直し

| 環境 B で起きたこと | 前の見立て | 今回の見直し | 確かさ |
|---|---|---|---|
| SDK で接続できるが、返事が DLP 違反 | 原因が分からない | Direct Line channels のブロック | 実測からの強い見込み |
| Microsoft 認証のエージェントを Direct Line で呼ぶと、返事の段階で断られた | Microsoft 認証は、利用者の Entra の券を求めるから | **DLP が原因だった見込み**。環境 A では、Microsoft 認証のエージェントに Direct Line のシークレットで頼んで、返事が来た(S0') | 推測。そのときの返事に `DataLossPreventionViolation` があったかで決まる |
| エージェントの「認証なし」がグレーアウト | 「Chat without Microsoft Entra ID authentication」のブロック | 文書では、このコネクタのブロックで「認証なし」と、手動で認証の一部(サービス プロバイダー汎用 OAuth 2 など)が選べなくなる(明記)。ただ、環境 A では、このコネクタをブロックしていない状態でも帯が出たことがあり、ほかの原因もありうる | 未確認 |

## 6. 呼び方ごとの、環境で要る設定

| | ① Agents SDK | ② Direct Line のシークレット |
|---|---|---|
| DLP で要る設定 | 「Direct Line channels in Copilot Studio」が**ブロックでない**こと(ビジネス・非ビジネスのどちらでもよい)。「Chat without Microsoft Entra ID authentication」はブロックのままでよい | 上に加えて、「Chat without Microsoft Entra ID authentication」も**ブロックでない**こと、かつ Direct Line channels と**同じ箱**であること |
| 呼ぶ側の認証 | Entra のサインインが必ず要る(アプリ登録・利用者の同意か管理者の同意・エージェントの共有) | 要らない(シークレットだけ) |
| だれが使ったか | 利用者ごとに分かる | 分からない |
| 組織の方針との相性 | 合う(サインインした人だけが使う) | ぶつかりやすい(サインインなしの会話を許すことになる) |
| CCP のサーバーの作り | 入口の Entra のサインインと、利用者のトークンの取り替え(On-Behalf-Of)が要る | シークレットを持ち、会話の 4 段の手順を呼ぶだけ |

### 速さと答え(これまでの測定から)

| 項目 | ① Agents SDK | ② Direct Line | 差 |
|---|---|---|---|
| 文の頼み(前回の測定。会話を始める時間を含む) | 3.6〜7.9 秒 | 3.2〜5.3 秒 | Direct Line がやや速く、ぶれが小さい。回数が少なく、はっきりした差とは言えない |
| 文の頼み(今回。各 1 回) | 4.2〜8.6 秒 | 4.1〜8.2 秒 | ほぼ同じ |
| 答えの決まり | JSON ○、英語の文字数が少し長い(1 回の測定) | JSON・決まりとも すべて ○ | ぶれの範囲の見込み(同じエージェント・同じモデル) |
| 費用 | 1 回あたり約 1 クレジット | 同じ | なし |
| 画像を付けた頼み | **未確認** | 7 枚で 11 秒。1 回の送信は 4MB まで | — |
| 同時に 6〜9 回呼んだとき | **未確認** | **未確認** | — |

速さに大きな差はありません。選ぶ決め手は、組織がサインインなしの会話を許すかどうかです。

## 7. 環境 B の管理者に頼むこと(下書き)

| # | 頼むこと | 理由 |
|---|---|---|
| 1 | CCP の環境だけ、データポリシーで「**Direct Line channels in Copilot Studio**」を**ブロックから外す**(環境ごとのポリシーか、テナントのポリシーの対象から外す形) | Agents SDK の呼び出しがこのコネクタに数えられ、ブロックされていると返事が `DataLossPreventionViolation` になる。エージェントは「Microsoft で認証する」のままで、認証なしの公開はしない |
| 2 | CCP 用のアプリ登録に、Power Platform API の `CopilotStudio.Copilots.Invoke`(委任)の**管理者の同意**を与える | 利用者ごとの同意の画面をなくすため。CCP のサーバーが利用者の代わりに呼ぶ形(On-Behalf-Of)では、ほぼ必須 |
| 3 | 環境に Copilot Studio のクレジット(か、ライセンス)を割り当てる | エージェントに「premium features」の警告があると、ないときは公開できない |
| 4 | (Direct Line のシークレットで呼ぶ場合だけ)「Chat without Microsoft Entra ID authentication」もブロックから外し、Direct Line channels と同じ箱に置く | サインインなしの会話を許すことになるので、組織の方針と合わせて判断してもらう |

参考の文書(Microsoft Learn):

- Configure data policies for agents(Copilot Studio)
- Integrate web or native apps with Microsoft 365 Agents SDK(Copilot Studio)
- Data policies(Power Platform)

## 8. 環境 B で確かめること

| 確かめること | 分かること |
|---|---|
| CCP の環境にかかるポリシーで、「Direct Line channels in Copilot Studio」と「Chat without Microsoft Entra ID authentication」がどの箱か(ブロックか) | 頼むことが 1 つで済むか |
| 前に Direct Line(Microsoft 認証のエージェント)で断られたときの返事に、`DataLossPreventionViolation` があったか | 5 章の見直しが合っているか |
| ポリシーのスコープ(CCP の環境だけを例外にできるか) | 頼み方 |
| エラーの返事にはコネクタの名前が出ないので、止めているポリシーの中身は、管理者に見てもらう | — |

## 9. 試し方(検証の道具)

`tools/ms-verify/measure.mjs` で、T1 を 1 回ずつ送ります。設定は `%USERPROFILE%\.ccp\ms-verify.env` に書きます(MS_AI_VERIFY.md 12.4)。

```bash
node measure.mjs --via dl --only T1 --runs 1 --dump-trace
```

```bash
node measure.mjs --via sdk --suffix DLP --only T1 --runs 1
```

- `--dump-trace`: 返事のほかに届く知らせ(trace など)を表示します。DLP で止まったときは `ErrorCode` が出ます。
- `--suffix DLP`: `APP_CLIENT_ID_DLP`・`COPILOT_AGENT_SCHEMA_NAME_DLP`・`COPILOT_ENVIRONMENT_ID_DLP`・`TENANT_ID_DLP` のうち、値のあるものを使います。いつもの値を書き換えずに、別のアプリ登録・エージェントで試せます。
- ポリシーを変えたら、数分待ってから呼びます。前と同じ結果なら、少し待って呼び直します。

## 10. 後片付け

| 試しに作ったもの | 片付け方 |
|---|---|
| 検証用のデータポリシー | 消す。テナントのすべての環境を対象にしていると、ほかの環境の Direct Line なども止まるので、次に試すときはスコープを検証の環境だけに絞る |
| 試しのアプリ登録(SDK 用) | 使わないなら消す。設定のファイルの `_DLP` の値も消す |
| エージェントの認証 | 試しで変えたなら、元に戻して公開し直す |
