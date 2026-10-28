// テンプレートを AI で作る(T9。src/templateDraft.ts)の、AI の返答の読み方と「近いテンプレート」が、例どおりに決まることを確かめる。
//   node scripts/check-template-ai.mjs   ← npm run verify に含まれる
// AI の返答は形が崩れることがあるので、読むときの検査(知らない種類・はみ出す幅・多すぎる行を外す)を例で固める。
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { report, viteForChecks } from './check-approvals.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const same = (problems, name, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${name}: ${JSON.stringify(got)}(期待: ${JSON.stringify(want)})`)
}

/** 確かめる(server は、src を読み込む Vite のサーバー) */
export async function checkTemplateAi(server) {
  const problems = []
  const td = await server.ssrLoadModule('/src/templateDraft.ts')
  const tb = await server.ssrLoadModule('/src/tables.ts')
  const tpl = await server.ssrLoadModule('/src/templates.ts')
  const mock = await server.ssrLoadModule('/src/mock/agent.ts')
  const boxes = (d) => d.sections.reduce((n, s) => n + tb.boxesOf(s).length, 0)

  // 撮影用の AI の見本の返答を、そのまま読める(箱の数 = 頼んだ数、メイン画像の下のボタン、ID は重ならない)
  for (const n of [1, 4, 7]) {
    const raw = JSON.parse(mock.mockAgent(`テンプレート ${JSON.stringify({ task: 'design_template', request: { purpose: '新作', itemCount: n, hero: 'offer' } })}`))
    const d = td.parseTemplateDraft(raw)
    if (!d) {
      problems.push(`見本の返答(${n} 点)が読めない`)
      continue
    }
    same(problems, `見本の返答(${n} 点): 箱の数`, boxes(d), n)
    same(problems, `見本の返答(${n} 点): メイン画像`, d.hero, 'offer')
    same(problems, `見本の返答(${n} 点): メイン画像の下のボタン`, d.heroTable?.parts?.map((p) => [p.type, p.label]), [['button', '商品を見る']])
    const ids = d.sections.flatMap((s) => s.parts.map((p) => p.id))
    same(problems, `見本の返答(${n} 点): 部品の ID は重ならない`, new Set(ids).size, ids.length)
  }

  // 崩れた返答: 知らない種類は外す・幅が 4 を超える部品は外す・行は 8 まで・空いたマスは空き・知らない値は外す
  const d = td.parseTemplateDraft({
    name: 'x'.repeat(80),
    hero: 'neon',
    sections: [
      {
        name: 'S',
        heading: true,
        copy: false,
        rows: [
          [{ type: 'box', w: 3, view: 'zigzag', fields: ['name', 'price', 'sparkle'] }, { type: 'box', w: 2 }],
          [{ type: 'video', w: 1 }, { type: 'text', text: 'お知らせ', w: 1 }],
          ...Array.from({ length: 10 }, () => [{ type: 'line' }]),
        ],
      },
      { name: '空', rows: [[{ type: 'nothing' }]] },
    ],
  })
  if (!d) problems.push('崩れた返答が読めない')
  else {
    const s = d.sections[0]
    same(problems, '崩れた返答: セクションの数(空のセクションは外す)', d.sections.length, 1)
    same(problems, '崩れた返答: 名前の長さ', d.name.length, 40)
    same(problems, '崩れた返答: 知らないメイン画像は標準', d.hero, 'standard')
    same(problems, '崩れた返答: 列・行', [s.cols, s.rows], [3, 8])
    same(problems, '崩れた返答: 見出し・コピー', [s.categoryHeading, s.copy], [true, false])
    const p0 = s.parts.find((p) => p.c === 0 && p.r === 0)
    same(problems, '崩れた返答: 箱の知らない値は外す', [p0?.type, p0?.w, p0?.view, p0?.fields], ['box', 3, undefined, ['name', 'price']])
    same(problems, '崩れた返答: はみ出す箱・知らない種類は外し、空きで埋める', s.parts.filter((p) => p.r <= 1).map((p) => `${p.type}@${p.c},${p.r}`).sort(), ['box@0,0', 'empty@1,1', 'empty@2,1', 'text@0,1'].sort())
    same(problems, '崩れた返答: 枠の数は箱の数', s.slots, 1)
  }
  same(problems, '読めない返答は null', [td.parseTemplateDraft({}), td.parseTemplateDraft({ sections: [] }), td.parseTemplateDraft({ sections: [{ rows: [[{ type: 'x' }]] }] })], [null, null, null])

  // 近いテンプレート: 作る前は、箱の数とメイン画像の形が同じもの。作ったあとは、同じ構成を先に
  const opts = tpl.templateOptions('email')
  const before = td.nearTemplates(opts, { itemCount: 4, hero: 'standard' })
  if (!before.some((n) => n.id === 'standard4')) problems.push(`作る前の近い: standard4 がない(${before.map((n) => n.id).join(',')})`)
  if (before.some((n) => n.id === 'free')) problems.push('作る前の近い: 自由な並び(free)は出さない')
  const std = tpl.getTemplate('standard4')
  const after = td.nearTemplates(opts, { itemCount: 4, hero: 'standard' }, tb.toTableLayout(std))
  same(problems, '作ったあとの近い: 同じ構成を先に', [after[0]?.id, after[0]?.same], ['standard4', true])

  // AI で直す(11 章): 残す部品の ID はそのまま。知らない ID・種類の変わった ID は新しく。付け直してしまった ID は救う
  const te = await server.ssrLoadModule('/src/templateEdit.ts')
  const base = tb.toTableLayout(std)
  const cur = { sections: base.sections, heroTable: base.heroTable }
  const idsOf = (l) => [...(l.heroTable ? [l.heroTable] : []), ...l.sections].flatMap((s) => s.parts.filter((p) => p.type !== 'empty').map((p) => p.id))
  const oldIds = idsOf(cur)
  const ask = (request) => te.parseTemplateEdit(JSON.parse(mock.mockAgent(`直す ${JSON.stringify({ task: 'edit_template', request, template: te.layoutForAi(cur) })}`)), cur)
  {
    const b = ask('全部の箱にセールのバッジ')
    same(problems, '直す(バッジ): 部品の ID は変わらない', b && idsOf(b).sort(), [...oldIds].sort())
    same(problems, '直す(バッジ): 変わったのは箱だけ', b && [b.diff.changed.length, b.diff.added.length, b.diff.removed.length], [boxes(cur), 0, 0])
    const c = ask('2 列のグリッドを 3 列に')
    same(problems, '直す(3 列): もとの部品の ID は残る', c && oldIds.every((id) => idsOf(c).includes(id)), true)
    same(problems, '直す(3 列): 足した箱は新しい ID', c && c.diff.added.length > 0 && c.diff.added.every((id) => !oldIds.includes(id)), true)
    const d = ask('最後に行を足して')
    same(problems, '直す(行を足す): 足したのは 1 つ・消したものはない', d && [d.diff.added.length, d.diff.removed.length], [1, 0])
  }
  {
    // 崩れた返答: すべての ID を付け直し・知らない ID・同じ ID を二度。中身が同じものは元の ID に戻り、二度目は新しくなる
    const secs = te.layoutForAi(cur).sections
    const renamed = secs.map((s) => ({ ...s, id: 'sec_zzz', parts: s.parts.map((p) => ({ ...p, id: `x_${p.id}` })) }))
    const r = te.parseTemplateEdit({ sections: renamed }, cur)
    same(problems, '崩れた返答(付け直し): 元の ID に戻る', r && idsOf(r).sort(), [...oldIds].sort())
    same(problems, '崩れた返答(付け直し): 救った数', r?.diff.healed, oldIds.length - (cur.heroTable ? cur.heroTable.parts.filter((p) => p.type !== 'empty').length : 0))
    const first = secs[0].parts[0]
    const dup = te.parseTemplateEdit({ sections: [{ ...secs[0], parts: [first, { ...first, c: first.c, r: secs[0].rows, w: 1 }] , rows: secs[0].rows + 1 }] }, cur)
    const got = dup && dup.sections[0].parts.filter((p) => p.type === first.type)
    same(problems, '崩れた返答(同じ ID を二度): 一つ目だけ元の ID', got && got.filter((p) => p.id === first.id).length, 1)
    same(problems, '読めない返答(直す)は null', [te.parseTemplateEdit({}, cur), te.parseTemplateEdit({ sections: [{ parts: [{ type: 'x' }] }] }, cur)], [null, null])
  }

  return { problems, ok: 'template ai OK(作る: 返答の読み方・近いテンプレート / 直す: ID を残す)', title: 'テンプレートを AI で作る・直す所が、例と合いません' }
}

// 単独で流したとき
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createServer(viteForChecks(root))
  try {
    report(await checkTemplateAi(server))
  } finally {
    await server.close()
  }
}
