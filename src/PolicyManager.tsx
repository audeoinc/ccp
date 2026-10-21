// マーケティングポリシー(方針・決まり)の取り込みと一覧(バックログ M3・M4。設計は docs/POLICY.md の 6 章)。
// ⚙ →「方針・決まり」で開く。ファイル(ルール系 = Markdown、販売系 = CSV)を選ぶ → サーバーが読み分けた結果(件数・読めなかった行と理由)を見せる → 取り込む。
// 一覧は見るだけ(直すのは元のファイル。取り込み直すと置き換わる)。読み分けと保存は server/ccp/policies.py。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { ArrowUploadRegular, DismissRegular } from '@fluentui/react-icons'
import { appPath } from './appRoot'
import { PolicyRulesService } from './data/policyRules'
import { SalesPoliciesService } from './data/salesPolicies'
import { locale, useT } from './i18n'
import { RULE_STRENGTHS, RULE_TARGETS, type PolicyRule } from './models/policyRules'
import type { SalesPolicy } from './models/salesPolicies'

type Kind = 'rules' | 'sales'

interface Problem {
  line: number
  message: string
  where: string
}
interface Preview {
  kind: Kind
  filename: string
  title?: string
  count: number
  problems: Problem[]
  rules?: { rule_id: string; title: string; applies_to: string; strength: string; market: string; channel: string; check_spec?: string }[]
  weeks?: { week_start: string; market: string; rows: number }[]
  // 取り込んだあとだけ
  replaced?: number
  saved?: number
  duplicates?: string[]
}

const useStyles = makeStyles({
  surface: { maxWidth: '1100px', width: 'calc(96vw / var(--ui-zoom, 1))' },
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, maxHeight: 'calc(80vh / var(--ui-zoom, 1))' },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  grow: { flexGrow: 1 },
  scroll: { overflow: 'auto', minHeight: 0 },
  label: { fontSize: '12px', fontWeight: tokens.fontWeightMedium, color: tokens.colorNeutralForeground3 },
  small: { fontSize: '12px' },
  pre: { whiteSpace: 'pre-wrap', fontSize: '12px', margin: 0 },
  strength: { fontSize: '11px', fontWeight: tokens.fontWeightSemibold, borderRadius: tokens.borderRadiusMedium, padding: '0 6px', display: 'inline-block' },
  must: { backgroundColor: tokens.colorPaletteRedBackground2, color: tokens.colorPaletteRedForeground2 },
  should: { backgroundColor: tokens.colorPaletteYellowBackground2, color: tokens.colorPaletteYellowForeground2 },
  info: { backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground3 },
})

/** 取り込むファイルの種類を、拡張子から決める(csv は販売系、それ以外は Markdown のルール系) */
const kindOf = (name: string): Kind => (/\.csv$/i.test(name) ? 'sales' : 'rules')

async function postPolicy(path: 'preview' | 'import', body: { kind: Kind; filename: string; content: string }): Promise<{ data?: Preview; error?: string }> {
  try {
    const res = await fetch(appPath(`/api/policies/${path}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => null)) as { success: boolean; data?: Preview; error?: { message: string } } | null
    if (!json) return { error: `${res.status}` }
    return json.success ? { data: json.data } : { data: json.data, error: json.error?.message ?? 'error' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

const fmtDate = (v?: string) => (v ? new Date(v).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

export function PolicyManager({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const styles = useStyles()
  const t = useT()
  const [kind, setKind] = useState<Kind>('rules')
  const [rules, setRules] = useState<PolicyRule[]>([])
  const [sales, setSales] = useState<SalesPolicy[]>([])
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<{ kind: Kind; filename: string; content: string } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [fTarget, setFTarget] = useState('')
  const [fStrength, setFStrength] = useState('')
  const [fMarket, setFMarket] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const [r, s] = await Promise.all([
      PolicyRulesService.getAll({ orderBy: ['source_file asc', 'sort_order asc'], top: 5000 }),
      SalesPoliciesService.getAll({ orderBy: ['week_start desc', 'market asc', 'scope asc'], top: 5000 }),
    ])
    if (r.success) setRules(r.data ?? [])
    if (s.success) setSales(s.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    // 開くたびに、前回の確かめの結果を消して読み直す
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(null)
    setFile(null)
    setError(null)
    setDone(null)
    void reload()
  }, [open, reload])

  const pick = async (f: File | undefined) => {
    if (!f) return
    const content = await f.text()
    const k = kindOf(f.name)
    const next = { kind: k, filename: f.name, content }
    setKind(k)
    setFile(next)
    setDone(null)
    setError(null)
    setBusy('preview')
    const { data, error: err } = await postPolicy('preview', next)
    setBusy(null)
    setPreview(data ?? null)
    if (err) setError(err)
  }

  const doImport = async () => {
    if (!file) return
    setBusy('import')
    const { data, error: err } = await postPolicy('import', file)
    setBusy(null)
    if (err) {
      setError(err)
      if (data) setPreview(data)
      return
    }
    setPreview(null)
    setFile(null)
    const n = data?.saved ?? 0
    setDone(
      data?.kind === 'sales'
        ? t(`取り込みました: ${n} 行(${data?.weeks?.length ?? 0} 週 × 市場を置き換え)`, `Imported ${n} rows (${data?.weeks?.length ?? 0} week × market groups replaced)`)
        : t(`取り込みました: ${n} 件(${data?.filename} の決まりを置き換え)`, `Imported ${n} rules (replaced the rules from ${data?.filename})`) +
            (data?.duplicates?.length ? t(` ※ 別のファイルにも同じ番号があります: ${data.duplicates.join(', ')}`, ` — the same ids also exist in another file: ${data.duplicates.join(', ')}`) : ''),
    )
    await reload()
    onImported()
  }

  const markets = useMemo(() => Array.from(new Set([...rules.flatMap((r) => (r.market ?? '').split(',').filter(Boolean)), ...sales.map((s) => s.market ?? '').filter(Boolean)])).sort(), [rules, sales])
  const shownRules = rules.filter(
    (r) =>
      (fTarget === '' || (r.applies_to ?? '').split(',').includes(fTarget)) &&
      (fStrength === '' || r.strength === fStrength) &&
      (fMarket === '' || !r.market || r.market.split(',').includes(fMarket)),
  )
  const shownSales = sales.filter((s) => fMarket === '' || s.market === fMarket)
  const strengthLabel = (s?: string) => (s === 'must' ? t('必ず守る', 'Must') : s === 'should' ? t('なるべく', 'Should') : t('背景', 'Info'))
  const strengthClass = (s?: string) => `${styles.strength} ${s === 'must' ? styles.must : s === 'should' ? styles.should : styles.info}`
  const scopeLabel = (s?: string) => (s === 'product' ? t('商品', 'Product') : s === 'category' ? t('カテゴリ', 'Category') : t('全体', 'All'))

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className={styles.surface}>
        {/* 広いフロートの中を自分で並べるので、DialogBody は使わない(ARCHITECTURE の落とし穴) */}
        <div className={styles.body}>
          <div className={styles.row}>
            <DialogTitle className={styles.grow}>{t('方針・決まり(マーケティングポリシー)', 'Marketing policies')}</DialogTitle>
            <Button appearance="subtle" size="small" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />
          </div>
          <div className={styles.row}>
            <input ref={inputRef} type="file" accept=".md,.markdown,.txt,.csv" hidden onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
            <Button appearance="primary" size="small" icon={<ArrowUploadRegular />} disabled={busy !== null} onClick={() => inputRef.current?.click()}>
              {t('ファイルを選んで確かめる', 'Choose a file to check')}
            </Button>
            <Text className={styles.small}>
              {t('ルール系の決まりは Markdown、販売系の方針は CSV(書き方は docs/POLICY_FORMAT.md)。取り込む前に、読めた件数と、読めなかった行を確かめます。', 'Rules: Markdown. Sales policies: CSV (see docs/POLICY_FORMAT.md). Review the parsed counts and skipped lines before importing.')}
            </Text>
          </div>
          {error && (
            <MessageBar layout="multiline" intent="error">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}
          {done && (
            <MessageBar layout="multiline" intent="success">
              <MessageBarBody>{done}</MessageBarBody>
            </MessageBar>
          )}
          {busy === 'preview' && <Spinner size="tiny" label={t('読み分けています…', 'Parsing…')} />}
          {preview && file && (
            <MessageBar layout="multiline" intent={preview.problems.length ? 'warning' : 'info'}>
              <MessageBarBody>
                <div className={styles.row}>
                  <Text weight="semibold">
                    {preview.kind === 'sales'
                      ? t(`${preview.filename}: ${preview.count} 行(${preview.weeks?.length ?? 0} 週 × 市場)`, `${preview.filename}: ${preview.count} rows (${preview.weeks?.length ?? 0} week × market groups)`)
                      : t(`${preview.filename}: 決まり ${preview.count} 件${preview.title ? `(${preview.title})` : ''}`, `${preview.filename}: ${preview.count} rules${preview.title ? ` (${preview.title})` : ''}`)}
                  </Text>
                  <span className={styles.grow} />
                  <Button appearance="primary" size="small" disabled={busy !== null || preview.count === 0} onClick={() => void doImport()}>
                    {busy === 'import'
                      ? t('取り込み中…', 'Importing…')
                      : preview.kind === 'sales'
                        ? t('取り込む(これらの週を置き換える)', 'Import (replace these weeks)')
                        : t('取り込む(このファイルの決まりを置き換える)', 'Import (replace rules from this file)')}
                  </Button>
                </div>
                {preview.kind === 'sales' && preview.weeks && (
                  <div className={styles.small}>{preview.weeks.map((w) => `${w.week_start} ${w.market}: ${w.rows}`).join(' / ')}</div>
                )}
                {preview.problems.length > 0 && (
                  <>
                    <div className={styles.label}>{t(`読めなかった・気になる行: ${preview.problems.length}`, `Skipped or questionable lines: ${preview.problems.length}`)}</div>
                    <pre className={styles.pre}>{preview.problems.map((p) => `L${p.line}${p.where ? ` ${p.where}` : ''}: ${p.message}`).join('\n')}</pre>
                  </>
                )}
              </MessageBarBody>
            </MessageBar>
          )}
          <div className={styles.row}>
            <TabList selectedValue={kind} onTabSelect={(_, d) => setKind(d.value as Kind)} size="small">
              <Tab value="rules">{t(`ルール系の決まり(${rules.length})`, `Rules (${rules.length})`)}</Tab>
              <Tab value="sales">{t(`販売系の方針(${sales.length})`, `Sales policies (${sales.length})`)}</Tab>
            </TabList>
            <span className={styles.grow} />
            {kind === 'rules' && (
              <>
                <Select size="small" value={fTarget} onChange={(_, d) => setFTarget(d.value)} aria-label={t('対象', 'Applies to')}>
                  <option value="">{t('対象: すべて', 'Applies to: all')}</option>
                  {RULE_TARGETS.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </Select>
                <Select size="small" value={fStrength} onChange={(_, d) => setFStrength(d.value)} aria-label={t('強さ', 'Strength')}>
                  <option value="">{t('強さ: すべて', 'Strength: all')}</option>
                  {RULE_STRENGTHS.map((x) => (
                    <option key={x} value={x}>{strengthLabel(x)}</option>
                  ))}
                </Select>
              </>
            )}
            <Select size="small" value={fMarket} onChange={(_, d) => setFMarket(d.value)} aria-label={t('市場', 'Market')}>
              <option value="">{t('市場: すべて', 'Market: all')}</option>
              {markets.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
          <div className={styles.scroll}>
            {loading && <Spinner size="tiny" />}
            {!loading && kind === 'rules' && (
              <Table size="extra-small" aria-label={t('ルール系の決まり', 'Rules')}>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>{t('番号', 'Id')}</TableHeaderCell>
                    <TableHeaderCell>{t('決まり', 'Rule')}</TableHeaderCell>
                    <TableHeaderCell>{t('対象', 'Applies to')}</TableHeaderCell>
                    <TableHeaderCell>{t('強さ', 'Strength')}</TableHeaderCell>
                    <TableHeaderCell>{t('市場・チャネル・期間', 'Market / channel / period')}</TableHeaderCell>
                    <TableHeaderCell>{t('確かめ方', 'Check')}</TableHeaderCell>
                    <TableHeaderCell>{t('ファイル(取り込み)', 'File (imported)')}</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownRules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className={styles.small}>{r.rule_id}</TableCell>
                      <TableCell>
                        <div className={styles.small}>
                          <Text weight="semibold" size={200}>{r.title}</Text>
                          {r.body && <div>{r.body}</div>}
                        </div>
                      </TableCell>
                      <TableCell className={styles.small}>{(r.applies_to ?? '').split(',').join(', ')}</TableCell>
                      <TableCell><span className={strengthClass(r.strength)}>{strengthLabel(r.strength)}</span></TableCell>
                      <TableCell className={styles.small}>
                        {[r.market || t('全市場', 'All markets'), r.channel || t('両チャネル', 'Both channels'), r.period_start || r.period_end ? `${r.period_start ?? ''} - ${r.period_end ?? ''}` : t('いつでも', 'Always')].join(' / ')}
                      </TableCell>
                      <TableCell className={styles.small}>{r.check_spec ?? ''}</TableCell>
                      <TableCell className={styles.small}>{r.source_file}{r.imported_at ? ` (${fmtDate(r.imported_at)})` : ''}</TableCell>
                    </TableRow>
                  ))}
                  {shownRules.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className={styles.small}>{t('決まりはありません', 'No rules')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
            {!loading && kind === 'sales' && (
              <Table size="extra-small" aria-label={t('販売系の方針', 'Sales policies')}>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>{t('週(月曜から)', 'Week (from Monday)')}</TableHeaderCell>
                    <TableHeaderCell>{t('市場', 'Market')}</TableHeaderCell>
                    <TableHeaderCell>{t('対象', 'Scope')}</TableHeaderCell>
                    <TableHeaderCell>{t('段階・優先', 'Stage / priority')}</TableHeaderCell>
                    <TableHeaderCell>{t('販促の期間', 'Promo period')}</TableHeaderCell>
                    <TableHeaderCell>{t('重点・メモ', 'Focus / note')}</TableHeaderCell>
                    <TableHeaderCell>{t('ファイル(取り込み)', 'File (imported)')}</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownSales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className={styles.small}>{s.week_start}</TableCell>
                      <TableCell className={styles.small}>{s.market}</TableCell>
                      <TableCell className={styles.small}>{scopeLabel(s.scope)}{s.target ? ` ${s.target}` : ''}</TableCell>
                      <TableCell className={styles.small}>{[s.stage, s.priority != null ? t(`優先 ${s.priority}`, `P${s.priority}`) : ''].filter(Boolean).join(' / ')}</TableCell>
                      <TableCell className={styles.small}>{s.promo_period ?? ''}</TableCell>
                      <TableCell className={styles.small}>{[s.focus, s.note].filter(Boolean).join(' — ')}</TableCell>
                      <TableCell className={styles.small}>{s.source_file}{s.imported_at ? ` (${fmtDate(s.imported_at)})` : ''}</TableCell>
                    </TableRow>
                  ))}
                  {shownSales.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className={styles.small}>{t('方針はありません', 'No sales policies')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </DialogSurface>
    </Dialog>
  )
}
