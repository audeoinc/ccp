import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { ArrowDownloadRegular, BranchCompareRegular, CheckmarkStarburstRegular, ClipboardTaskListLtrRegular, SaveRegular, StarRegular, TableSimpleRegular } from '@fluentui/react-icons'
import { WorkApi, bytesLabel, isFailure, type CheckResult, type VersionMeta, type WorkInfo } from './api'
import { CopyButton } from './CopyButton'
import { JobInfo } from './JobInfo'
import { ddl, diffLines, outputs, targetTable } from './work'

const useStyles = makeStyles({
  bar: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', padding: '6px 8px', backgroundColor: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusMedium },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  muted: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  dirty: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteMarigoldForeground2 },
  check: { display: 'flex', flexDirection: 'column', gap: '6px' },
  issues: { margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200, display: 'flex', flexDirection: 'column', gap: '2px' },
  ng: { color: tokens.colorPaletteRedForeground1 },
  warn: { color: tokens.colorPaletteMarigoldForeground2 },
  ex: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  pre: { margin: 0, fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '55vh', overflowY: 'auto', padding: '8px', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium },
  diff: { margin: 0, fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, maxHeight: '60vh', overflowY: 'auto', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  dl: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '0 8px' },
  add: { backgroundColor: tokens.colorPaletteGreenBackground1 },
  del: { backgroundColor: tokens.colorPaletteRedBackground1, textDecoration: 'line-through', color: tokens.colorNeutralForeground3 },
  field: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '200px', flexGrow: 1 },
})

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const usd = (v: number | null | undefined) => (v == null ? '—' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`)

interface Props {
  output: string
  onOutput: (output: string) => void
  sql: string
  /** 版を開いたとき、SQL の欄を差し替える */
  onLoadSql: (sql: string) => void
  /** AI に頼む(答え合わせの NG を返して直してもらう) */
  onAsk: (text: string) => void
}

/**
 * 出力ごとの作業(DEVTOOLS.md の 3.1 の ④〜⑧): 作る出力を選び、SQL を版として残し、答え合わせをして、表を作る SQL を出す。
 * 版・採用の印・出す先は、Workbench のフォルダ(server/devwork/)に残る
 */
export function WorkPanel({ output, onOutput, sql, onLoadSql, onAsk }: Props) {
  const s = useStyles()
  const [work, setWork] = useState<WorkInfo | null>(null)
  const [error, setError] = useState('')
  // いま欄にある SQL の元の版(開いた・保存した版。欄を直すと「変更あり」)
  const [loaded, setLoaded] = useState<{ output: string; v: number; sql: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [withContext, setWithContext] = useState(true)
  const [diffOpen, setDiffOpen] = useState(false)
  const [ddlOpen, setDdlOpen] = useState(false)

  const reload = async () => {
    const r = await WorkApi.list()
    if (isFailure(r)) setError(r.error)
    else setWork(r)
  }
  useEffect(() => {
    void (async () => {
      const r = await WorkApi.list()
      if (isFailure(r)) setError(r.error)
      else setWork(r)
    })()
  }, [])

  const out = output ? work?.outputs[output] : undefined
  const current = loaded && loaded.output === output ? loaded : null
  const dirty = !!current && current.sql.trim() !== sql.trim()
  const version = current && !dirty ? current.v : null
  const meta = version ? out?.versions.find((x) => x.v === version) ?? null : null

  const save = async () => {
    if (!output || !sql.trim()) return
    setBusy('save')
    const r = await WorkApi.save(output, sql)
    setBusy('')
    if (isFailure(r)) return setError(r.error)
    setLoaded({ output, v: r.v, sql })
    await reload()
  }

  const open = async (v: number) => {
    const r = await WorkApi.get(output, v)
    if (isFailure(r)) return setError(r.error)
    setLoaded({ output, v, sql: r.sql })
    setCheck(null)
    onLoadSql(r.sql)
  }

  const adopt = async () => {
    if (!output || !version) return
    await WorkApi.adopt(output, out?.adopted === version ? null : version)
    await reload()
  }

  const runCheck = async (run: boolean) => {
    if (!output || !sql.trim()) return
    setBusy(run ? 'check' : 'estimate')
    setError('')
    const r = await WorkApi.check(output, sql, { version, withContext, run })
    setBusy('')
    if (isFailure(r)) {
      setCheck(null)
      return setError(r.error)
    }
    setCheck(r)
    if (run) await reload()
  }

  const askFix = () => {
    if (!check?.issues) return
    const lines = check.issues.map((i) => `- [${i.level}] ${i.message}${i.count ? ` ${i.count} 行` : ''}${i.examples.length ? `(例: ${i.examples.join(', ')})` : ''}`)
    onAsk(`いまの SQL(${outputs().find((o) => o.value === output)?.label} の出力)を答え合わせしたら、次の結果でした。NG を直した SQL をください。注意は、直すべきかを考えて教えてください。\n\n${lines.join('\n')}`)
  }

  const versionLabel = (x: VersionMeta) =>
    `v${x.v}${out?.adopted === x.v ? ' ★採用' : ''}${x.check ? ` NG ${x.check.ng}・注意 ${x.check.warn}` : ''}`

  return (
    <div className={s.check}>
      <div className={s.bar}>
        <span className={s.label}>作る出力</span>
        <Dropdown
          size="small"
          style={{ minWidth: '150px' }}
          value={output ? outputs().find((o) => o.value === output)?.label : '決めない'}
          selectedOptions={[output]}
          onOptionSelect={(_, d) => {
            onOutput(d.optionValue ?? '')
            setCheck(null)
          }}
        >
          <Option value="">決めない</Option>
          {outputs().map((o) => (
            <Option key={o.value} value={o.value}>
              {o.label}
            </Option>
          ))}
        </Dropdown>
        {output && (
          <>
            <Dropdown
              size="small"
              style={{ minWidth: '170px' }}
              placeholder={out?.versions.length ? '版を開く' : '版はまだない'}
              disabled={!out?.versions.length}
              value={current ? `v${current.v}${dirty ? '(変更あり)' : ''}` : ''}
              selectedOptions={current ? [String(current.v)] : []}
              onOptionSelect={(_, d) => void open(Number(d.optionValue))}
            >
              {[...(out?.versions ?? [])].reverse().map((x) => (
                <Option key={x.v} value={String(x.v)} text={`v${x.v}`}>
                  {versionLabel(x)}
                </Option>
              ))}
            </Dropdown>
            <Button size="small" icon={<SaveRegular />} disabled={!sql.trim() || !!busy || (!!current && !dirty)} onClick={() => void save()} title="いまの SQL を新しい版として残す">
              版として保存
            </Button>
            <Button size="small" appearance="subtle" icon={<StarRegular />} disabled={!version} onClick={() => void adopt()} title="この版を、表を作る・結びつきの相手に使う版にする">
              {version && out?.adopted === version ? '採用を外す' : '採用'}
            </Button>
            <Button size="small" appearance="subtle" icon={<BranchCompareRegular />} disabled={(out?.versions.length ?? 0) < 1} onClick={() => setDiffOpen(true)}>
              違い
            </Button>
            <Button size="small" appearance="subtle" icon={<ClipboardTaskListLtrRegular />} disabled={!sql.trim() || !!busy} onClick={() => void runCheck(false)} title="全件を流して、CCP の取り込みと同じ確かめにかける(先に、読む量と料金を見せる)">
              答え合わせ
            </Button>
            <Button size="small" appearance="subtle" icon={<TableSimpleRegular />} disabled={!sql.trim()} onClick={() => setDdlOpen(true)}>
              表を作る SQL
            </Button>
            {dirty && <span className={s.dirty}>v{current?.v} から変更あり(保存すると新しい版)</span>}
            {busy && <Spinner size="extra-tiny" label={busy === 'check' ? '全件を流して確かめています' : busy === 'estimate' ? '読む量を見ています' : '保存しています'} />}
          </>
        )}
        {!output && <span className={s.muted}>出力を選ぶと、版を残す・答え合わせ・表を作る SQL が使えます</span>}
      </div>

      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {check && !check.ran && (
        <MessageBar intent={check.error ? 'error' : check.missing.length ? 'error' : 'info'} layout="multiline">
          <MessageBarBody>
            {check.error ?? (check.missing.length ? `必須の列がありません: ${check.missing.join(', ')}` : `全件を流すと、読む量 ${bytesLabel(check.bytes)}・概算 ${usd(check.cost_usd)}(${check.weight})です。`)}
            {check.context.length > 0 && <div>結びつきも確かめます: {check.context.join(', ')} の採用の版を流します(読む量に含む)</div>}
            {check.missing_optional.length > 0 && <div>あると使う列がない: {check.missing_optional.join(', ')}</div>}
            {!check.error && !check.missing.length && (
              <div className={s.row} style={{ marginTop: '4px' }}>
                <Button size="small" appearance="primary" icon={<CheckmarkStarburstRegular />} onClick={() => void runCheck(true)} disabled={!!busy}>
                  全件で答え合わせ
                </Button>
                <Checkbox label="結びつき(SKU → SPU など)も確かめる" checked={withContext} onChange={(_, d) => setWithContext(!!d.checked)} />
              </div>
            )}
          </MessageBarBody>
        </MessageBar>
      )}

      {check?.ran && (
        <div className={s.check}>
          <div className={s.row}>
            <Badge appearance="filled" color={check.ng ? 'danger' : 'success'}>
              NG {check.ng}
            </Badge>
            <Badge appearance="tint" color={check.warn ? 'warning' : 'informative'}>
              注意 {check.warn}
            </Badge>
            <span className={s.muted}>
              {check.rows?.toLocaleString()} 行を確かめました{version ? `(v${version} に記録)` : '(保存していない SQL なので、記録はしない)'}
            </span>
            {!!check.issues?.length && (
              <Button size="small" onClick={askFix}>
                AI に直してもらう
              </Button>
            )}
            <CopyButton
              text={() => (check.issues ?? []).map((i) => `[${i.level}] ${i.message}${i.count ? ` ${i.count} 行` : ''}${i.examples.length ? `(例: ${i.examples.join(', ')})` : ''}`).join('\n')}
              label="結果をコピー"
            />
          </div>
          {!!check.issues?.length && (
            <ul className={s.issues}>
              {check.issues.map((i, k) => (
                <li key={k} className={i.level === 'NG' ? s.ng : s.warn}>
                  [{i.level}] {i.message}
                  {i.count ? ` ${i.count.toLocaleString()} 行` : ''}
                  {i.examples.length > 0 && <span className={s.ex}>(例: {i.examples.join(', ')})</span>}
                </li>
              ))}
            </ul>
          )}
          {check.notes?.map((n, k) => (
            <span key={k} className={s.muted}>
              {n}
            </span>
          ))}
          {check.job && <JobInfo job={check.job} />}
        </div>
      )}

      {diffOpen && out && <DiffDialog output={output} versions={out.versions} sql={sql} onClose={() => setDiffOpen(false)} />}
      {ddlOpen && work && (
        <DdlDialog work={work} output={output} sql={sql} meta={meta} onClose={() => setDdlOpen(false)} onSaved={() => void reload()} />
      )}
    </div>
  )
}

/** 2 つの版の違い(左の版 → 右の版。右には「いまの欄」も選べる) */
function DiffDialog({ output, versions, sql, onClose }: { output: string; versions: VersionMeta[]; sql: string; onClose: () => void }) {
  const s = useStyles()
  const last = versions[versions.length - 1]?.v ?? 0
  const [a, setA] = useState(String(Math.max(last - 1, versions[0]?.v ?? 0) || last))
  const [b, setB] = useState('now')
  const [texts, setTexts] = useState<Record<string, string>>({ now: sql })

  useEffect(() => {
    for (const k of [a, b]) {
      if (k === 'now' || texts[k] !== undefined) continue
      void WorkApi.get(output, Number(k)).then((r) => {
        if (!isFailure(r)) setTexts((t) => ({ ...t, [k]: r.sql }))
      })
    }
  }, [a, b, output, texts])

  const lines = useMemo(() => (texts[a] !== undefined && texts[b] !== undefined ? diffLines(texts[a], texts[b]) : null), [texts, a, b])
  const choices = [...versions.map((x) => ({ value: String(x.v), label: `v${x.v}` })), { value: 'now', label: 'いまの欄' }]

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: '960px', width: '92vw' }}>
        <DialogBody>
          <DialogTitle>版の違い</DialogTitle>
          <DialogContent>
            <div className={s.row} style={{ marginBottom: '8px' }}>
              {[
                [a, setA],
                [b, setB],
              ].map(([v, set], k) => (
                <Dropdown key={k} size="small" value={choices.find((c) => c.value === v)?.label} selectedOptions={[v as string]} onOptionSelect={(_, d) => (set as (x: string) => void)(d.optionValue ?? '')}>
                  {choices.map((c) => (
                    <Option key={c.value} value={c.value}>
                      {c.label}
                    </Option>
                  ))}
                </Dropdown>
              ))}
              <span className={s.muted}>緑 = 足した行・赤 = 消した行</span>
            </div>
            {!lines ? (
              <Spinner size="tiny" />
            ) : (
              <div className={s.diff}>
                {lines.map((l, k) => (
                  <div key={k} className={mergeClasses(s.dl, l.kind === 'add' && s.add, l.kind === 'del' && s.del)}>
                    {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  '}
                    {l.text || ' '}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>閉じる</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 表を作る SQL(出す先は 1 度入れれば、すべての出力に使う)。CCP の設定の行と、採用の版のまとめも */
function DdlDialog({ work, output, sql, meta, onClose, onSaved }: { work: WorkInfo; output: string; sql: string; meta: VersionMeta | null; onClose: () => void; onSaved: () => void }) {
  const s = useStyles()
  const [dataset, setDataset] = useState(work.target.dataset ?? '')
  const [prefix, setPrefix] = useState(work.target.prefix ?? 'ccp_')
  const [allBusy, setAllBusy] = useState(false)
  const table = targetTable(dataset || '<プロジェクト>.<データセット>', prefix, output)
  const text = ddl(output, sql, table, meta)
  const env = `${work.outputs[output]?.env ?? 'BQ_?'}=${table}`
  const saveTarget = () => {
    if (dataset !== (work.target.dataset ?? '') || prefix !== (work.target.prefix ?? 'ccp_')) void WorkApi.target(dataset, prefix).then(onSaved)
  }

  // 採用の版を、出力の順に 1 つのファイルにまとめる(コンソールに 1 つずつ貼るときの手元の控え)
  const downloadAll = async () => {
    setAllBusy(true)
    const parts: string[] = []
    const envs: string[] = []
    for (const o of outputs()) {
      const w = work.outputs[o.value]
      if (!w?.adopted) continue
      const r = await WorkApi.get(o.value, w.adopted)
      if (isFailure(r)) continue
      const t = targetTable(dataset, prefix, o.value)
      parts.push(ddl(o.value, r.sql, t, w.versions.find((x) => x.v === w.adopted) ?? null))
      envs.push(`-- ${w.env}=${t}`)
    }
    setAllBusy(false)
    if (!parts.length) return
    download('ccp_outputs.sql', [`-- CCP の出力の表を作る SQL(採用の版)。server/workbench.env に書く行:`, ...envs, '', ...parts].join('\n'))
  }

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: '960px', width: '92vw' }}>
        <DialogBody>
          <DialogTitle>表を作る SQL({outputs().find((o) => o.value === output)?.label})</DialogTitle>
          <DialogContent>
            <div className={s.row} style={{ marginBottom: '8px', alignItems: 'flex-end' }}>
              <label className={s.field}>
                <span className={s.label}>出す先のデータセット(元の表と同じ場所に)</span>
                <Input size="small" value={dataset} placeholder="プロジェクト.データセット" onChange={(_, d) => setDataset(d.value)} onBlur={saveTarget} />
              </label>
              <label className={s.field} style={{ minWidth: '120px', flexGrow: 0 }}>
                <span className={s.label}>表の名前の頭</span>
                <Input size="small" value={prefix} onChange={(_, d) => setPrefix(d.value)} onBlur={saveTarget} />
              </label>
            </div>
            {!meta && <MessageBar intent="warning" style={{ marginBottom: '8px' }}><MessageBarBody>いまの欄の SQL は、保存した版ではありません(答え合わせの記録がつきません)。「版として保存」してから出すのがおすすめです。</MessageBarBody></MessageBar>}
            {meta && !meta.check && <MessageBar intent="warning" style={{ marginBottom: '8px' }}><MessageBarBody>この版は、まだ答え合わせをしていません。</MessageBarBody></MessageBar>}
            {meta?.check && meta.check.ng > 0 && <MessageBar intent="error" style={{ marginBottom: '8px' }}><MessageBarBody>この版には NG が {meta.check.ng} 件あります。CCP は NG のある出力を取り込みません。</MessageBarBody></MessageBar>}
            <pre className={s.pre}>{text}</pre>
            <div className={s.row} style={{ marginTop: '8px' }}>
              <span className={s.label}>CCP の設定(server/workbench.env)</span>
              <code className={s.ex}>{env}</code>
              <CopyButton text={() => env} />
            </div>
          </DialogContent>
          <DialogActions>
            <Button icon={<ArrowDownloadRegular />} onClick={() => void downloadAll()} disabled={allBusy || !dataset} title="6 つの出力のうち、採用の版があるものを 1 つのファイルに">
              採用の版をまとめて保存
            </Button>
            <Button icon={<ArrowDownloadRegular />} onClick={() => download(`${prefix}${output}.sql`, text)}>
              .sql で保存
            </Button>
            <CopyButton label="SQL をコピー" appearance="primary" size="medium" text={() => text} />
            <Button onClick={onClose}>閉じる</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
