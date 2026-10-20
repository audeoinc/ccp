import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogSurface,
  DialogTitle,
  Input,
  Select,
  Spinner,
  Tab,
  TabList,
  Textarea,
  ToggleButton,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components'
import { AddRegular, ArrowSyncRegular, CopyRegular, DismissRegular } from '@fluentui/react-icons'
import { tr, useT } from '../i18n'
import { AutoTextarea } from '../AutoTextarea'
import { ProcessInterviewsService } from '../data/processInterviews'
import { ProcessChecksService } from '../data/processChecks'
import type { ProcessInterview } from '../models/processInterviews'
import { ProcessCheckDecision, ProcessCheckGap, ProcessCheckHandle, type ProcessCheck, type ProcessCheckFields } from '../models/processChecks'
import { metricRows, processRows, processStages, reviewRows, type StageTone } from './processRows'

const useStyles = makeStyles({
  surface: { width: 'min(1180px, 96vw)', maxWidth: 'none', height: '92vh', maxHeight: '92vh', display: 'flex', flexDirection: 'column', rowGap: '10px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '12px', rowGap: '8px', flexWrap: 'wrap' },
  grow: { flexGrow: 1 },
  tabs: { flexWrap: 'wrap' },
  who: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  status: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  statusErr: { color: tokens.colorPaletteRedForeground1 },
  scroll: { overflowY: 'auto', flexGrow: 1, minHeight: 0, display: 'grid', rowGap: '20px', alignContent: 'start', paddingRight: '4px' },
  intro: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, maxWidth: '80ch', margin: 0 },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  value: { fontSize: tokens.fontSizeBase200, margin: 0 },
  muted: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, margin: 0 },
  h2: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, margin: 0 },
  h3: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, margin: 0 },
  section: { display: 'grid', rowGap: '10px' },
  stageHead: { display: 'grid', rowGap: '2px', paddingLeft: '10px', borderLeftWidth: '4px', borderLeftStyle: 'solid' },
  // 面の色(計画=ブランド・制作=橙・結果=緑)を段階の色に使う。要否・物差しは紫
  plan: { borderLeftColor: tokens.colorBrandStroke1, color: tokens.colorBrandForeground1 },
  prod: { borderLeftColor: tokens.colorPaletteDarkOrangeBorderActive, color: tokens.colorPaletteDarkOrangeForeground2 },
  res: { borderLeftColor: tokens.colorPaletteGreenBorderActive, color: tokens.colorPaletteGreenForeground2 },
  other: { borderLeftColor: tokens.colorPalettePurpleBorderActive, color: tokens.colorPalettePurpleForeground2 },
  stageText: { color: tokens.colorNeutralForeground1 },
  // 業務の行: 左に CCP の前提運用、右に今の運用。下に差・差の扱い・メモ
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground1 },
  rowTitle: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', columnGap: '10px', padding: '8px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  id: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, border: '1px solid currentColor', borderRadius: tokens.borderRadiusSmall, padding: '0 6px' },
  done: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteGreenForeground2 },
  side: { padding: '10px 12px', display: 'grid', rowGap: '6px', alignContent: 'start', minWidth: 0 },
  asis: { backgroundColor: tokens.colorNeutralBackground3 },
  tags: { display: 'flex', flexWrap: 'wrap', columnGap: '4px', rowGap: '4px' },
  tag: { fontSize: tokens.fontSizeBase200, borderRadius: tokens.borderRadiusSmall, padding: '0 7px', backgroundColor: tokens.colorBrandBackground2, color: tokens.colorNeutralForeground1 },
  fids: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  verdict: { gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '6em 1fr', columnGap: '12px', rowGap: '8px', alignItems: 'center', padding: '8px 12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  chips: { display: 'flex', flexWrap: 'wrap', columnGap: '6px', rowGap: '6px' },
  // 選んだ選択肢の色: 良い(差なし・合わせる・要る)= 緑、直す・要らない = 赤、差あり・保留 = 黄、業務はない = 灰
  good: { backgroundColor: tokens.colorPaletteGreenBackground1, color: tokens.colorPaletteGreenForeground1, ...shorthands.borderColor(tokens.colorPaletteGreenBorder2) },
  bad: { backgroundColor: tokens.colorPaletteRedBackground1, color: tokens.colorPaletteRedForeground1, ...shorthands.borderColor(tokens.colorPaletteRedBorder2) },
  hold: { backgroundColor: tokens.colorPaletteMarigoldBackground1, color: tokens.colorPaletteMarigoldForeground2, ...shorthands.borderColor(tokens.colorPaletteMarigoldBorder2) },
  same: { backgroundColor: tokens.colorNeutralBackground5, color: tokens.colorNeutralForeground1, ...shorthands.borderColor(tokens.colorNeutralStroke1) },
  list: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorNeutralBackground1 },
  item: { display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.2fr', columnGap: '16px', rowGap: '8px', padding: '10px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, ':last-child': { borderBottomStyle: 'none' } },
  cell: { display: 'grid', rowGap: '4px', alignContent: 'start', minWidth: 0 },
  metric: { display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', columnGap: '16px', padding: '8px 12px', alignItems: 'start', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, ':last-child': { borderBottomStyle: 'none' } },
  // 見取り図
  summary: { overflowX: 'auto', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorNeutralBackground1 },
  table: { borderCollapse: 'collapse', width: '100%', minWidth: '640px', fontSize: tokens.fontSizeBase200 },
  th: { textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  td: { padding: '6px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}`, whiteSpace: 'nowrap' },
  n: { fontFamily: tokens.fontFamilyMonospace, textAlign: 'right' },
  bar: { display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground4, minWidth: '120px' },
  barGood: { backgroundColor: tokens.colorPaletteGreenBackground3 },
  barGap: { backgroundColor: tokens.colorPaletteMarigoldBackground3 },
  barSame: { backgroundColor: tokens.colorNeutralForeground4 },
  dot: { fontWeight: tokens.fontWeightBold, marginRight: '4px' },
  md: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, minHeight: '180px' },
})

type Data = Record<string, Partial<ProcessCheck>>
type Filter = 'all' | 'R' | 'M' | string

/** 保存しない列(行の ID・作った時刻など)を除いた、書く列 */
const FIELDS: (keyof ProcessCheckFields)[] = ['asis', 'gap', 'handle', 'decision', 'value', 'note']
const WHO_KEY = 'processCheck.who'
const TEXT_DELAY_MS = 700

const choices = <T extends Record<string, string>>(o: T) => Object.entries(o) as [keyof T & string, string][]
const label = (o: Record<string, string>, v?: string) => (v ? (o[v] ?? '') : '')
/** Markdown の表のセルに入れられる形にする(| と改行) */
const cell = (s?: string) => (s ?? '').replace(/\|/g, '/').replace(/\r?\n/g, '<br>')

/** 選択肢のボタンの並び。選んだものをもう一度押すと、選んでいない状態に戻る */
function Chips({ list, current, onPick, label: aria }: { list: [string, string][]; current?: string; onPick: (v: string) => void; label: string }) {
  const s = useStyles()
  const tone = (v: string) => (v === 'none' || v === 'adopt' || v === 'keep' ? s.good : v === 'fix' || v === 'remove' ? s.bad : v === 'nowork' ? s.same : s.hold)
  return (
    <div className={s.chips} role="group" aria-label={aria}>
      {list.map(([v, name]) => (
        <ToggleButton key={v} size="small" shape="circular" checked={current === v} className={current === v ? tone(v) : undefined} onClick={() => onPick(current === v ? '' : v)}>
          {name}
        </ToggleButton>
      ))}
    </div>
  )
}

/**
 * 前提運用の照らし合わせ(docs/FLOWS.md の 7 章)。⚙ のメニューから開く。開発元の本番だけの画面(Workbench 版には入れない)。
 * 聞き取り先ごとに、業務と前提の決まりの行(2 章)・要検討(5 章)・物差し(6 章)の答えを、表 process_interviews / process_checks に保存する。
 * 文字は手が止まってから、選択はすぐに保存する。同じ行の書き込みは、順番に 1 つずつ(行の作成が二重にならないように)
 */
export default function ProcessCheck({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStyles()
  const t = useT()
  const stages = processStages()
  const rows = processRows()
  const reviews = reviewRows()
  const metrics = metricRows()
  const gaps = choices(ProcessCheckGap)
  const handles = choices(ProcessCheckHandle)
  const decisions = choices(ProcessCheckDecision)

  const [interviews, setInterviews] = useState<ProcessInterview[]>([])
  const [who, setWho] = useState<string | null>(null)
  const [data, setData] = useState<Data>({})
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [newName, setNewName] = useState('')
  const [status, setStatus] = useState<{ msg: string; err?: boolean } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  // 保存は画面の描き直しと関係なく動くので、最新の値を ref にも持つ
  const dataRef = useRef<Data>({})
  const whoRef = useRef<string | null>(null)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const chains = useRef(new Map<string, Promise<void>>())

  const save = useCallback((rowId: string) => {
    timers.current.delete(rowId)
    const interview = whoRef.current
    if (!interview) return
    const prev = chains.current.get(rowId) ?? Promise.resolve()
    const next = prev.then(async () => {
      // 前の書き込みで id が付いているかもしれないので、走る直前に読む
      const cur = whoRef.current === interview ? dataRef.current[rowId] : undefined
      if (!cur) return
      const fields: Partial<ProcessCheckFields> = {}
      for (const f of FIELDS) if (f in cur) Object.assign(fields, { [f]: cur[f] ?? '' })
      setStatus({ msg: tr('保存しています…', 'Saving…') })
      const r = cur.id ? await ProcessChecksService.update(cur.id, fields) : await ProcessChecksService.create({ interview_id: interview, row_id: rowId, ...fields })
      if (!r.success) {
        setStatus({ msg: tr('保存できませんでした。もう一度入力してください', 'Could not save. Please enter it again'), err: true })
        return
      }
      if (!cur.id && r.data?.id && whoRef.current === interview) {
        dataRef.current = { ...dataRef.current, [rowId]: { ...dataRef.current[rowId], id: r.data.id } }
        setData(dataRef.current)
      }
      setStatus({ msg: tr('保存しました', 'Saved') })
    })
    chains.current.set(rowId, next)
  }, [])

  /** 待っている保存を、すぐに走らせる(聞き取り先を変える前・閉じる前に) */
  const flush = useCallback(() => {
    for (const [rowId, h] of [...timers.current]) {
      clearTimeout(h)
      save(rowId)
    }
  }, [save])

  const loadRows = useCallback(async (id: string | null) => {
    whoRef.current = id
    dataRef.current = {}
    setData({})
    if (!id) return
    setLoading(true)
    const r = await ProcessChecksService.getAll({ filter: `interview_id eq '${id}'` })
    setLoading(false)
    if (whoRef.current !== id) return
    if (!r.success) return setStatus({ msg: tr('読み込めませんでした', 'Could not load'), err: true })
    const next: Data = {}
    for (const row of r.data ?? []) next[row.row_id] = row
    dataRef.current = next
    setData(next)
  }, [])

  const selectWho = useCallback(
    (id: string | null) => {
      flush()
      setWho(id)
      try {
        if (id) localStorage.setItem(WHO_KEY, id)
      } catch {
        /* 覚えられなくても、選び直せばよい */
      }
      void loadRows(id)
    },
    [flush, loadRows],
  )

  const loadInterviews = useCallback(async () => {
    const r = await ProcessInterviewsService.getAll({ orderBy: ['created_on asc'] })
    if (!r.success) return setStatus({ msg: tr('読み込めませんでした', 'Could not load'), err: true })
    const list = r.data ?? []
    setInterviews(list)
    let saved: string | null = null
    try {
      saved = localStorage.getItem(WHO_KEY)
    } catch {
      /* 読めなければ、最後の聞き取り先 */
    }
    const pick = list.find((i) => i.id === (whoRef.current ?? saved)) ?? list[list.length - 1]
    selectWho(pick?.id ?? null)
  }, [selectWho])

  useEffect(() => {
    if (!open) return
    // 開いたときに読み直す(ほかの人の入力も見えるように)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInterviews()
  }, [open, loadInterviews])

  const close = () => {
    flush()
    setStatus(null)
    onClose()
  }

  const addInterview = useCallback(async (name: string) => {
    const r = await ProcessInterviewsService.create({ name })
    if (!r.success || !r.data) {
      setStatus({ msg: tr('足せませんでした', 'Could not add'), err: true })
      return null
    }
    setInterviews((l) => [...l, r.data])
    selectWho(r.data.id)
    return r.data.id
  }, [selectWho])

  /** 1 行の値を変える。文字は手が止まってから、選択はすぐに保存する */
  const change = useCallback(async (rowId: string, patch: Partial<ProcessCheckFields>, now?: boolean) => {
    // 聞き取り先がまだなければ、仮の名前で作ってから書く(入力が消えないように)
    if (!whoRef.current && !(await addInterview(tr('聞き取り 1', 'Interview 1')))) return
    dataRef.current = { ...dataRef.current, [rowId]: { ...dataRef.current[rowId], ...patch } }
    setData(dataRef.current)
    const h = timers.current.get(rowId)
    if (h) clearTimeout(h)
    if (now) save(rowId)
    else timers.current.set(rowId, setTimeout(() => save(rowId), TEXT_DELAY_MS))
  }, [addInterview, save])

  const area = (rowId: string, field: 'asis' | 'note', placeholder: string, rowsMin = 1) => (
    <AutoTextarea size="small" rows={rowsMin} value={data[rowId]?.[field] ?? ''} placeholder={placeholder} aria-label={placeholder} onChange={(_, d) => void change(rowId, { [field]: d.value })} />
  )
  const toneClass: Record<StageTone, string> = { plan: s.plan, prod: s.prod, res: s.res, other: s.other }
  const shown = (key: string) => filter === 'all' || filter === key

  // 見取り図: 段階ごとに、照らした数・差の内訳・差の扱いの内訳を数える
  const counts = (ids: string[]) => {
    const c = { none: 0, gap: 0, nowork: 0, adopt: 0, fix: 0, hold: 0 }
    for (const id of ids) {
      const d = data[id]
      if (d?.gap) c[d.gap]++
      if (d?.gap === 'gap' && d.handle) c[d.handle]++
    }
    return c
  }
  const dec = { keep: 0, remove: 0, hold: 0 }
  for (const r of reviews) {
    const v = data[r.id]?.decision
    if (v) dec[v]++
  }

  const md = (() => {
    const name = interviews.find((i) => i.id === who)?.name ?? tr('(名前なし)', '(no name)')
    const out = [
      `## ${tr('聞き取り', 'Interview')}: ${name}`,
      '',
      `### ${tr('前提運用との照らし合わせ(2 章)', 'Comparison with assumed operations (ch. 2)')}`,
      '',
      `| ${tr('業務', 'Task')} | ${tr('名前', 'Name')} | ${tr('今の運用', 'Current operation')} | ${tr('差', 'Gap')} | ${tr('差の扱い', 'Handling')} | ${tr('メモ', 'Notes')} |`,
      '|---|---|---|---|---|---|',
    ]
    for (const r of rows) {
      const d = data[r.id] ?? {}
      out.push(`| ${r.id} | ${r.name} | ${cell(d.asis)} | ${label(ProcessCheckGap, d.gap)} | ${d.gap === 'gap' ? label(ProcessCheckHandle, d.handle) : ''} | ${cell(d.note)} |`)
    }
    out.push('', `### ${tr('機能の要否(5 章)', 'Feature review (ch. 5)')}`, '', `| # | ${tr('機能', 'Feature')} | ${tr('要否', 'Decision')} | ${tr('聞いたこと・理由', 'What we heard, reason')} |`, '|---|---|---|---|')
    for (const r of reviews) {
      const d = data[r.id] ?? {}
      out.push(`| ${r.id} | ${r.name} | ${label(ProcessCheckDecision, d.decision)} | ${cell(d.note)} |`)
    }
    out.push('', `### ${tr('今の値(6 章)', 'Current values (ch. 6)')}`, '', `| ${tr('物差し', 'Measure')} | ${tr('今の値', 'Current value')} | ${tr('測り方・出どころ', 'How measured, source')} |`, '|---|---|---|')
    for (const m of metrics) {
      const d = data[m.id] ?? {}
      out.push(`| ${m.name} | ${cell(d.value)} | ${cell(d.note)} |`)
    }
    return out.join('\n')
  })()

  const copyMd = () => {
    navigator.clipboard.writeText(md).then(
      () => setCopied(t('コピーしました', 'Copied')),
      () => setCopied(t('コピーできませんでした。下の欄を選んで Ctrl+C でコピーしてください', 'Could not copy. Select the box below and press Ctrl+C')),
    )
  }

  const tabs: [Filter, string, StageTone | null][] = [
    ['all', t('すべて', 'All'), null],
    ...stages.map((st) => [st.key, st.name, st.tone] as [Filter, string, StageTone]),
    ['R', t('機能の要否', 'Feature review'), 'other'],
    ['M', t('今の値', 'Current values'), 'other'],
  ]

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={s.surface}>
        <div className={s.head}>
          <DialogTitle>{t('前提運用の照らし合わせ', 'Process check against assumed operations')}</DialogTitle>
          <div className={s.grow} />
          <div className={s.who}>
            <span className={s.label}>{t('聞き取り先', 'Interviewee')}</span>
            <Select size="small" value={who ?? ''} aria-label={t('聞き取り先', 'Interviewee')} onChange={(_, d) => selectWho(d.value || null)}>
              {interviews.length === 0 && <option value="">{t('(まだない。名前を入れて「足す」)', '(none yet — enter a name and Add)')}</option>}
              {interviews.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
            <Input size="small" value={newName} placeholder={t('例: US の企画チーム', 'e.g. US planning team')} aria-label={t('新しい聞き取り先の名前', 'New interviewee name')} onChange={(_, d) => setNewName(d.value)} />
            <Button
              size="small"
              icon={<AddRegular />}
              disabled={!newName.trim()}
              onClick={async () => {
                const name = newName.trim()
                if (await addInterview(name)) {
                  setNewName('')
                  setStatus({ msg: tr(`「${name}」を足しました`, `Added "${name}"`) })
                }
              }}
            >
              {t('足す', 'Add')}
            </Button>
            <Button size="small" appearance="subtle" icon={<ArrowSyncRegular />} title={t('読み直す(ほかの人の入力も見る)', 'Reload (see others’ input)')} onClick={() => {
              flush()
              void loadInterviews()
            }} />
          </div>
          {loading ? <Spinner size="tiny" /> : status && <span className={mergeClasses(s.status, status.err && s.statusErr)} role="status">{status.msg}</span>}
          <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={close} />
        </div>
        <TabList size="small" className={s.tabs} selectedValue={filter} onTabSelect={(_, d) => setFilter(String(d.value))}>
          {tabs.map(([k, name, tn]) => (
            <Tab key={k} value={k}>
              {tn && <span className={mergeClasses(s.dot, toneClass[tn])}>■</span>}
              {name}
            </Tab>
          ))}
        </TabList>

        <div className={s.scroll}>
          <p className={s.intro}>
            {t(
              '左は、CCP が前提にしている運用です。これを見せながら今の運用を聞き、右に書きます。そのうえで「差なし / 差あり / その業務はない」を付けます。差があるときは、運用を CCP に合わせるのか(それで良くなる)、CCP を直すのかを選びます。入力はその場で保存され、ほかの人も同じ聞き取り先を開けば見えます。終わったら、いちばん下の「Markdown で写す」で FLOWS.md(業務の流れと前提運用)に反映できます。',
              'On the left is the operation CCP assumes. Show it, ask how things work today, and write that on the right. Then mark "No gap / Gap / No such task". Where there is a gap, choose whether to adopt CCP’s way (an improvement) or fix CCP. Input saves as you go and is visible to anyone who opens the same interviewee. When done, use "Copy as Markdown" at the bottom to update FLOWS.md (Business flow and assumed operations).',
            )}
          </p>

          {filter === 'all' && (
            <section className={s.section}>
              <h2 className={s.h2}>{t('見取り図', 'Overview')}</h2>
              <div className={s.summary}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      {[t('段階', 'Stage'), t('照らした', 'Checked'), t('差なし', 'No gap'), t('差あり', 'Gap'), t('└ CCP に合わせる', '└ Adopt CCP'), t('└ CCP を直す', '└ Fix CCP'), t('└ 保留', '└ Hold'), t('業務はない', 'No such task'), ''].map((h, i) => (
                        <th key={i} className={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((st) => {
                      const ids = rows.filter((r) => r.stage === st.key).map((r) => r.id)
                      const c = counts(ids)
                      const done = c.none + c.gap + c.nowork
                      return (
                        <tr key={st.key}>
                          <td className={s.td}>
                            <span className={mergeClasses(s.dot, toneClass[st.tone])}>■</span>
                            {st.name}
                          </td>
                          <td className={mergeClasses(s.td, s.n)}>{`${done} / ${ids.length}`}</td>
                          {(['none', 'gap', 'adopt', 'fix', 'hold', 'nowork'] as const).map((k) => (
                            <td key={k} className={mergeClasses(s.td, s.n)}>{c[k] || ''}</td>
                          ))}
                          <td className={s.td}>
                            <div className={s.bar} role="img" aria-label={t(`差なし ${c.none}、差あり ${c.gap}、業務はない ${c.nowork}`, `No gap ${c.none}, gap ${c.gap}, no such task ${c.nowork}`)}>
                              {c.none > 0 && <span className={s.barGood} style={{ width: `${(c.none / ids.length) * 100}%` }} />}
                              {c.gap > 0 && <span className={s.barGap} style={{ width: `${(c.gap / ids.length) * 100}%` }} />}
                              {c.nowork > 0 && <span className={s.barSame} style={{ width: `${(c.nowork / ids.length) * 100}%` }} />}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    <tr>
                      <td className={s.td}>
                        <span className={mergeClasses(s.dot, s.other)}>■</span>
                        {t('機能の要否', 'Feature review')}
                      </td>
                      <td className={mergeClasses(s.td, s.n)}>{`${dec.keep + dec.remove + dec.hold} / ${reviews.length}`}</td>
                      <td className={mergeClasses(s.td, s.muted)} colSpan={7}>
                        {t(`要る ${dec.keep} ・ 要らない ${dec.remove} ・ 保留 ${dec.hold}`, `Keep ${dec.keep} · Remove ${dec.remove} · Hold ${dec.hold}`)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {stages.filter((st) => shown(st.key)).map((st) => (
            <section key={st.key} className={s.section}>
              <div className={mergeClasses(s.stageHead, toneClass[st.tone])}>
                <h2 className={mergeClasses(s.h2, s.stageText)}>{`${st.key} ${st.name}`}</h2>
                <p className={s.muted}>{t('聞くこと: ', 'Ask: ') + st.ask}</p>
              </div>
              {rows
                .filter((r) => r.stage === st.key)
                .map((r) => {
                  const d = data[r.id] ?? {}
                  return (
                    <article key={r.id} className={s.row}>
                      <div className={s.rowTitle}>
                        <span className={mergeClasses(s.id, toneClass[st.tone])}>{r.id}</span>
                        <h3 className={mergeClasses(s.h3, s.grow)}>{r.name}</h3>
                        {d.gap && <span className={s.done}>{t('照らした', 'Checked')}</span>}
                      </div>
                      <div className={s.side}>
                        <span className={s.label}>{t('CCP の前提運用', 'What CCP assumes')}</span>
                        <p className={s.value}>{r.ccp}</p>
                        {r.gains.length > 0 && (
                          <div className={s.tags}>
                            {r.gains.map((g) => (
                              <span key={g} className={s.tag}>{g}</span>
                            ))}
                          </div>
                        )}
                        {r.fids && <span className={s.fids}>{r.fids}</span>}
                      </div>
                      <div className={mergeClasses(s.side, s.asis)}>
                        <span className={s.label}>{t('今の運用', 'Current operation')}</span>
                        {area(r.id, 'asis', t('聞いた今の運用(だれが・何で・どのくらい)', 'How it works today (who, with what, how much)'), 3)}
                      </div>
                      <div className={s.verdict}>
                        <span className={s.label}>{t('差', 'Gap')}</span>
                        <Chips list={gaps} current={d.gap} onPick={(v) => void change(r.id, { gap: v as ProcessCheckGap | '', handle: v === 'gap' ? (d.handle ?? '') : '' }, true)} label={t(`${r.id} の差`, `${r.id} gap`)} />
                        {d.gap === 'gap' && <span className={s.label}>{t('差の扱い', 'Handling')}</span>}
                        {d.gap === 'gap' && <Chips list={handles} current={d.handle} onPick={(v) => void change(r.id, { handle: v as ProcessCheckHandle | '' }, true)} label={t(`${r.id} の差の扱い`, `${r.id} handling`)} />}
                        <span className={s.label}>{t('メモ', 'Notes')}</span>
                        {area(r.id, 'note', t('どこが違うか、なぜ今そうしているか', 'What differs, and why it is done that way today'))}
                      </div>
                    </article>
                  )
                })}
            </section>
          ))}

          {shown('R') && (
            <section className={s.section}>
              <div className={mergeClasses(s.stageHead, s.other)}>
                <h2 className={mergeClasses(s.h2, s.stageText)}>{t('機能の要否(5 章の要検討)', 'Feature review (ch. 5, to be decided)')}</h2>
                <p className={s.muted}>{t('聞いた今の運用から、要るかを決めます。迷うものは「保留」にして、使ってみてから決めます。', 'Decide from what you heard whether each is needed. If unsure, choose "Hold" and decide after trying it.')}</p>
              </div>
              <div className={s.list}>
                {reviews.map((r) => (
                  <div key={r.id} className={s.item}>
                    <div className={s.cell}>
                      <span className={mergeClasses(s.label, s.fids)}>{r.id}</span>
                      <h3 className={s.h3}>{r.name}</h3>
                      <p className={s.muted}>{r.why}</p>
                    </div>
                    <div className={s.cell}>
                      <span className={s.label}>{t('確かめること', 'What to check')}</span>
                      <p className={s.value}>{r.ask}</p>
                      <span className={s.label}>{t('要らなければ', 'If not needed')}</span>
                      <p className={s.value}>{r.ifno}</p>
                    </div>
                    <div className={s.cell}>
                      <Chips list={decisions} current={data[r.id]?.decision} onPick={(v) => void change(r.id, { decision: v as ProcessCheckDecision | '' }, true)} label={t(`${r.id} の要否`, `${r.id} decision`)} />
                      {area(r.id, 'note', t('聞いたこと・決めた理由', 'What we heard, why we decided'))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {shown('M') && (
            <section className={s.section}>
              <div className={mergeClasses(s.stageHead, s.other)}>
                <h2 className={mergeClasses(s.h2, s.stageText)}>{t('今の値(6 章の物差し)', 'Current values (ch. 6 measures)')}</h2>
                <p className={s.muted}>{t('使い始める前の値です。CCP を使ったあとに、同じ物差しで比べます。', 'Values before adopting CCP. Compare with the same measures afterwards.')}</p>
              </div>
              <div className={s.list}>
                {metrics.map((m) => (
                  <div key={m.id} className={s.metric}>
                    <div className={s.cell}>
                      <span className={mergeClasses(s.label, s.fids)}>{`${m.id} · ${m.rows}`}</span>
                      <span className={s.value}>{m.name}</span>
                    </div>
                    <Input size="small" value={data[m.id]?.value ?? ''} placeholder={t('今の値(例: 1 本 3 時間)', 'Current value (e.g. 3 hours each)')} aria-label={t(`${m.name} の今の値`, `${m.name}: current value`)} onChange={(_, d) => void change(m.id, { value: d.value })} />
                    <Input size="small" value={data[m.id]?.note ?? ''} placeholder={t('測り方・出どころ', 'How measured, source')} aria-label={t(`${m.name} の測り方`, `${m.name}: how measured`)} onChange={(_, d) => void change(m.id, { note: d.value })} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {filter === 'all' && (
            <section className={s.section}>
              <div className={mergeClasses(s.stageHead, s.other)}>
                <h2 className={mergeClasses(s.h2, s.stageText)}>{t('Markdown で写す', 'Copy as Markdown')}</h2>
                <p className={s.muted}>{t('この聞き取り先の内容を、表の形にします。FLOWS.md の 3.2 に貼り、3.1・5 章を直します。', 'Turns this interviewee’s answers into tables. Paste into FLOWS.md 3.2, then update 3.1 and chapter 5.')}</p>
              </div>
              <div className={s.who}>
                <Button appearance="primary" size="small" icon={<CopyRegular />} onClick={copyMd}>
                  {t('Markdown をコピー', 'Copy Markdown')}
                </Button>
                {copied && <span className={s.status}>{copied}</span>}
              </div>
              <Textarea readOnly value={md} resize="vertical" textarea={{ className: s.md }} aria-label={t('書き出した Markdown', 'Exported Markdown')} />
            </section>
          )}
        </div>
      </DialogSurface>
    </Dialog>
  )
}
