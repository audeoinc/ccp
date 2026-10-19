# 新しい版を受け取る手順: 利用先の Git と Workbench

CCP は、区切りのよいところで「Workbench 版」の ZIP(`ccp-workbench-<版>.zip`)として届きます。
受け取った ZIP を**利用先の Git のリポジトリ**に入れ、Workbench はそのリポジトリを `git pull` して動かします。

```
 ZIP(ccp-workbench-<版>.zip)
   │ ① ダウンロード
   ▼
 利用先の Git のリポジトリ ── ② 中身を入れ替えて、版の名前でコミット・push
   │ ③ git pull(scripts/workbench.sh update)
   ▼
 Vertex AI Workbench(読むだけ。push はしない)
```

- 版の名前は `<コミットの日付 YYYYMMDD>-<開発側のコミットの短い ID>`(例: `20261019-1a2b3c4`)。ZIP の中の `VERSION.txt` に書いてあります。
- ZIP の中は、1 つのフォルダ `ccp-workbench-<版>/` です。そのフォルダの**中身**が、リポジトリの中身になります。
- **利用先のリポジトリで、コードを直接直さないでください。** 次の版を入れるときに、すべて上書きされます。直したいことは、開発の担当に伝えてください。

---

## 1. 利用先の Git に入れる(版ごと)

Git の使える PC(または Workbench とは別の作業場所)で行います。初回は、空のリポジトリを作って clone しておきます。

### Linux・macOS・Git Bash

```bash
VER=20261019-1a2b3c4                              # 受け取った版(ZIP の名前の ccp-workbench- の後ろ)
ZIP=~/Downloads/ccp-workbench-$VER.zip
cd <利用先のリポジトリ>
git pull                                          # 先に最新にする(ほかの人が入れた版と、ぶつからないように)

# ① .git 以外を、すべて消す(前の版にあって、新しい版にないファイルを残さないため)
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

# ② ZIP を展開して、フォルダの中身を置く
TMP=$(mktemp -d)
unzip -q "$ZIP" -d "$TMP"
cp -a "$TMP/ccp-workbench-$VER/." .
rm -rf "$TMP"

# ③ 版の名前でコミットして、push する
git add -A
git status --short | head                         # 変わったファイルの一部を見る
git commit -m "CCP Workbench 版 $VER"
git tag "workbench-$VER"
git push origin HEAD --tags
```

### Windows(PowerShell)

```powershell
$VER = '20261019-1a2b3c4'
$ZIP = "$HOME\Downloads\ccp-workbench-$VER.zip"
cd <利用先のリポジトリ>
git pull
Get-ChildItem -Force | Where-Object Name -ne '.git' | Remove-Item -Recurse -Force
$TMP = Join-Path $env:TEMP "ccp-$VER"
Expand-Archive $ZIP -DestinationPath $TMP -Force
Copy-Item "$TMP\ccp-workbench-$VER\*" . -Recurse -Force
Remove-Item $TMP -Recurse -Force
git add -A
git commit -m "CCP Workbench 版 $VER"
git tag "workbench-$VER"
git push origin HEAD --tags
```

> Windows で入れるときは、`git config core.autocrlf false` にしておく(改行コードを書き換えずに、届いたままコミットするため)。
> `scripts/workbench.sh` の実行の権限は、ZIP に記録してあります。Windows で入れて権限が落ちたときは、
> `git update-index --chmod=+x scripts/workbench.sh` を実行してからコミットします(または Workbench で `bash scripts/workbench.sh …` のように実行します)。

### 入れたあとの確かめ

- `cat VERSION.txt` が、受け取った版になっている。
- `git log --oneline -1` が `CCP Workbench 版 <版>`。
- `.gitignore` によって、`server/workbench.env`(パスワード)・`server/images/`(写真)・`node_modules/` は Git に入らない。

### 前の版に戻すとき

```bash
git revert --no-edit HEAD        # 直前の版の取り込みを取り消すコミットを作る(履歴は残る)
git push origin HEAD
```

Workbench では、そのあと `scripts/workbench.sh update` を実行します。

---

## 2. Workbench で使う

### はじめて(新しい Workbench)

```bash
cd ~
git clone <利用先のリポジトリの URL> ccp
cd ccp
scripts/workbench.sh setup       # Python の環境・パッケージ・画面のビルド・設定ファイル(workbench.env)の用意
#   → server/workbench.env の <…> を書き換える
scripts/workbench.sh check
scripts/workbench.sh start
```

続きは [WORKBENCH.md](WORKBENCH.md)(データと写真の持ち込み・よくあるつまずき)。

### すでに CCP を動かしている Workbench で、取得元を利用先のリポジトリに切り替える(1 回だけ)

前の取得元とは Git の履歴がつながっていないので、`git pull` ではなく、次のように切り替えます。
`server/workbench.env`・`server/images/`・`server/.venv/`・`node_modules/` は Git の外にあるので、そのまま残ります。

```bash
cd ~/ccp
scripts/workbench.sh stop
git status --short               # 手で直したファイルがないかを見る(あれば、控えておく。次の行で消える)
git remote set-url origin <利用先のリポジトリの URL>
git fetch origin
git checkout -B main origin/main # 利用先のリポジトリの main に合わせる(ブランチ名が違えば、そちらに)
git reset --hard origin/main
scripts/workbench.sh update
```

### 新しい版が入ったとき(いつもの手順)

```bash
cd ~/ccp
scripts/workbench.sh update      # git pull → (必要なら)pip install → npm ci → ビルド → 起動し直す
scripts/workbench.sh status      # いまの版を確かめる
```

- Workbench からは **push しません**(コードは、版ごとに届くものだけにする)。
- 版の中に、データの列が増える変更があっても、サーバーが起動したときに DB に足します(手で migrate しなくてよい)。
