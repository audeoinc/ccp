"""docs/FLOWS.md から、照らし合わせのシートの記入用の Markdown(docs/FLOWS_SHEET.md)を作る。

聞き取りの場で、FLOWS.md と同じ行・同じ番号のまま書き込めるようにするため(紙に刷っても、画面を共有して書いてもよい)。
FLOWS.md の 0 章(解決する課題)・2 章(段階ごとの「聞くこと」・前提の決まり・業務の表)・5.3(要検討)・6 章(物差し)を読むので、
FLOWS.md の表を変えたら、これを流し直す:  python scripts/flows-sheet.py
行の番号(K1・A1・P1・R1・M1 など)は、FLOWS.md と同じものをそのまま写す(結果を FLOWS.md に戻すときの手がかり)。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'docs' / 'FLOWS.md'
OUT = ROOT / 'docs' / 'FLOWS_SHEET.md'

GAP = '☐ 差なし<br>☐ 差あり<br>☐ 業務はない'
HANDLE = '☐ 合わせる<br>☐ 直す<br>☐ 保留'
DECIDE = '☐ 要る<br>☐ 要らない<br>☐ 保留'
ISSUE = '☐ ある<br>☐ ない<br>☐ 一部'


def cells(line):
    return [c.strip() for c in line.strip().strip('|').split(' | ')]


def main():
    # Windows の端末(cp932)でも、最後の報告が化けないように
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    text = SRC.read_text(encoding='utf-8').replace('\r\n', '\n')
    lines = text.split('\n')

    # 2 章: 段階ごとに、聞くこと・前提の決まり・業務の行を集める
    stages, cur = [], None
    in2 = False
    for l in lines:
        if l.startswith('## 2.'):
            in2 = True
            continue
        if in2 and l.startswith('## ') and not l.startswith('## 2.'):
            break
        if not in2:
            continue
        m = re.match(r'^#{3,4} (2\.\d+(?:\.\d+)?) (.+)$', l)
        if m:
            if m.group(1) == '2.10':  # 「段階をまたぐもの」の見出しだけの節
                continue
            cur = {'no': m.group(1), 'name': m.group(2), 'ask': '', 'rules': [], 'rows': []}
            stages.append(cur)
            continue
        if cur is None or not l.startswith('|'):
            continue
        c = cells(l)
        if c[0] == '聞くこと':
            cur['ask'] = c[1]
        elif c[0] == '前提の決まり':
            for part in c[1].split('<br>'):
                pm = re.match(r'\*\*(P\d+)\*\* (.+)$', part)
                if pm:
                    cur['rules'].append((pm.group(1), pm.group(2)))
        elif re.match(r'^[A-G]\d+$', c[0]) and len(c) == 5:
            cur['rows'].append((c[0], c[1], c[2]))

    issues = [cells(l) for l in lines if re.match(r'^\| K\d+ \|', l)]
    review = [cells(l) for l in lines if re.match(r'^\| R\d+ \|', l)]
    metrics = [cells(l) for l in lines if re.match(r'^\| M\d+ \|', l)]

    out = [
        '# 照らし合わせのシート(記入用)',
        '',
        '[FLOWS.md](FLOWS.md)(業務の流れと前提運用)の 7 章「照らし合わせの進め方」で使う、記入用の写し。聞き取り先ごとに写して書く(紙に刷るなら横向き)。**書いたものは利用先の情報なので、このリポジトリには置かない。**',
        '**この文書は `scripts/flows-sheet.py` が FLOWS.md から作る。直接直さない**(FLOWS.md を直して、流し直す)。行の番号(K1・A1・P1・R1・M1 など)は、FLOWS.md と同じ。',
        '',
        '| 聞き取り先 | 日付 | 聞いた人 | 答えた人 |',
        '|---|---|---|---|',
        '| | | | |',
        '',
        '### 書き方',
        '',
        '1. 最初に、0 章の課題が今あるかを聞く(ある / ない / 一部)。',
        '2. 段階ごとに、「CCP の前提運用」を見せる(読み上げる)。',
        '3. 「聞くこと」を聞き、「今の運用」に書く(だれが・何で・どのくらい)。',
        '4. **差**: 今も前提どおりなら「差なし」、違えば「差あり」、その業務をしていなければ「業務はない」。',
        '5. 差ありなら **扱い**: 運用を CCP に「合わせる」(それで良くなる)/ CCP を「直す」(前提のほうが合っていない)/ 決められなければ「保留」。',
        '6. 終わったら、最後の「まとめ」を数えて、FLOWS.md の 3.2 に書く(利用先の名前は書かない)。',
        '',
        '---',
        '',
        '## 0. 解決する課題は、今あるか(FLOWS.md の 0 章)',
        '',
        '| # | 課題 | どの段階で | 今あるか | どのくらい困っているか・例 |',
        '|---|---|---|---|---|',
    ]
    for k in issues:
        out.append(f'| {k[0]} | {k[1]} | {k[2]} | {ISSUE} | |')
    out += ['', '---', '']
    for s in stages:
        out += [f'## {s["no"]} {s["name"]}', '']
        if s['ask']:
            out += [f'**聞くこと**: {s["ask"]}', '']
        out += ['| # | 業務・決まり | CCP の前提運用 | 今の運用 | 差 | 扱い | メモ |', '|---|---|---|---|---|---|---|']
        for rid, name, ccp in s['rows']:
            out.append(f'| {rid} | {name} | {ccp} | | {GAP} | {HANDLE} | |')
        for pid, rule in s['rules']:
            name, _, body = rule.partition(': ')
            out.append(f'| {pid} | {name}(前提の決まり) | {body} | | {GAP} | {HANDLE} | |')
        out.append('')

    out += ['---', '', '## 機能の要否(FLOWS.md の 5.3)', '',
            '| # | 機能 | なぜ要らないかもしれないか | 確かめること | 要否 | 聞いたこと・理由 |', '|---|---|---|---|---|---|']
    for r in review:
        out.append(f'| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {DECIDE} | |')
    out += ['', '## 今の値(FLOWS.md の 6 章)', '', '使い始める前の値。CCP を使ったあとに、同じ物差しで比べる。', '',
            '| # | 物差し | 今の値 | 測り方・出どころ |', '|---|---|---|---|']
    for m in metrics:
        out.append(f'| {m[0]} | {m[1]} | | |')
    out += ['', '## 全体', '', '| 聞くこと | 答え |', '|---|---|',
            '| CCP を使い始めたら、やめる資料・やり取りはどれか | |',
            '| ほかに、前提と違うと感じたこと | |', '',
            '## まとめ(数える)', '',
            '| 段階 | 照らした | 差なし | 差あり | うち 合わせる | うち 直す | うち 保留 | 業務はない |',
            '|---|---|---|---|---|---|---|---|']
    for s in stages:
        n = len(s['rows']) + len(s['rules'])
        out.append(f'| {s["no"]} {s["name"]} | / {n} | | | | | | |')
    out.append('| 機能の要否 | / %d | 要る: | 要らない: | 保留: | | | |' % len(review))
    out += ['', '| 課題 | ある | ない | 一部 |', '|---|---|---|---|', f'| / {len(issues)} | | | |']
    OUT.write_text('\n'.join(out) + '\n', encoding='utf-8', newline='\n')
    print(f'{OUT.relative_to(ROOT)}: 課題 {len(issues)}・段階 {len(stages)}・業務 {sum(len(s["rows"]) for s in stages)}・決まり {sum(len(s["rules"]) for s in stages)}・要否 {len(review)}・物差し {len(metrics)}')


if __name__ == '__main__':
    main()
