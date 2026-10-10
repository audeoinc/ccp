import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Field,
  Menu,
  MenuItemCheckbox,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  ToggleButton,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import {
  AddRegular,
  ArrowDownloadRegular,
  CalendarLtrRegular,
  ColumnTripleRegular,
  LayoutColumnTwoRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons'
import { Cr854_deliverycardsService } from './generated/services/Cr854_deliverycardsService'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import { Cr854_productsService } from './generated/services/Cr854_productsService'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import { Cr854_heroimagesService } from './generated/services/Cr854_heroimagesService'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import { Cr854_deliveryproductsService } from './generated/services/Cr854_deliveryproductsService'
import { Calendar } from './Calendar'
import { ListView } from './ListView'
import { COLUMNS, DEFAULT_COLUMNS, downloadCsv, toRows, type ColumnKey } from './listRows'
import { STATE_CANDIDATE } from './items'
import { withHeroLabels, withProductLabels } from './labels'
import { loadCustomTemplates } from './layoutTemplates'
import { TemplateManager } from './TemplateManager'
import { openTemplateManager, useTemplates } from './templates'
import { CardDetail, type NewCardDefaults } from './CardDetail'
import { loadAutoDraft, loadPref, saveAutoDraft, savePref } from './settings'
import { locale, optionLabel, setLang, tr, useLang, useT } from './i18n'
import { channelOptions, countryOptions, departmentOptions, statusColor, statusOptions } from './status'

// 表示の切り替え(月のカレンダー / 表の一覧)。ブラウザごとに覚える
type View = 'month' | 'list'
const VIEW_KEY = 'calendar.view'
const COLUMNS_KEY = 'list.columns'

interface Filters {
  country: string
  channel: string
  department: string
  status: string
}
const noFilter: Filters = { country: '', channel: '', department: '', status: '' }
// 開いたときの絞り込み: ビルドの設定(VITE_DEFAULT_COUNTRY。GCP 版は US)の国。なければ、絞り込まない
const initialFilters: Filters = {
  ...noFilter,
  country: String(countryOptions.find((o) => o.label === import.meta.env.VITE_DEFAULT_COUNTRY)?.value ?? ''),
}

const useStyles = makeStyles({
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow2,
  },
  headerIcon: { color: tokens.colorBrandForeground1, flexShrink: 0 },
  title: {
    flexGrow: 1,
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase400,
    letterSpacing: '0.01em',
  },
  // Fluent の標準スイッチは文字の色などを細かく変えにくいので、ヘッダーの設定だけ、自前のスイッチで描く
  autoDraft: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    border: 'none',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground2 },
  },
  track: {
    position: 'relative',
    flexShrink: 0,
    width: '32px',
    height: '18px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusCircular,
    border: `1.5px solid ${tokens.colorNeutralStrokeAccessible}`,
    backgroundColor: 'transparent',
    transitionProperty: 'background-color, border-color',
    transitionDuration: tokens.durationFast,
  },
  trackOn: { backgroundColor: tokens.colorBrandBackground, borderTopColor: tokens.colorBrandBackground, borderRightColor: tokens.colorBrandBackground, borderBottomColor: tokens.colorBrandBackground, borderLeftColor: tokens.colorBrandBackground },
  thumb: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '11px',
    height: '11px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralStrokeAccessible,
    transitionProperty: 'left, background-color',
    transitionDuration: tokens.durationFast,
  },
  thumbOn: { left: '16px', backgroundColor: tokens.colorNeutralForegroundOnBrand },
  langSwitch: {
    display: 'inline-flex',
    padding: '2px',
    columnGap: '2px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  langBtn: {
    border: 'none',
    borderRadius: tokens.borderRadiusSmall,
    padding: `2px ${tokens.spacingHorizontalS}`,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground2 },
  },
  langBtnOn: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    fontWeight: tokens.fontWeightSemibold,
    ':hover': { backgroundColor: tokens.colorBrandBackground },
  },
  autoDraftState: { fontWeight: tokens.fontWeightSemibold, minWidth: '2.2em', color: tokens.colorNeutralForeground1 },
  container: {
    width: '100%',
    boxSizing: 'border-box',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
  },
  // 一覧は列が多いので、画面の幅いっぱいまで使う
  containerWide: { maxWidth: '1600px' },
  center: { textAlign: 'center', padding: `${tokens.spacingVerticalXXXL} 0` },
  alert: { marginBottom: tokens.spacingVerticalL },
  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
    alignItems: 'flex-end',
  },
  filterField: { minWidth: '130px' },
  count: {
    marginLeft: 'auto',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  monthRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalS,
  },
  monthLabel: {
    minWidth: '120px',
    textAlign: 'center',
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  legend: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    marginLeft: 'auto',
    flexWrap: 'wrap',
  },
  legendPill: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    padding: `2px ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusCircular,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    whiteSpace: 'nowrap',
  },
  legendDot: { width: '8px', height: '8px', borderRadius: tokens.borderRadiusCircular, flexShrink: 0 },
  viewSwitch: { display: 'inline-flex', columnGap: '2px', marginLeft: tokens.spacingHorizontalM },
})

function FilterSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: number; label: string }[]
  onChange: (v: string) => void
}) {
  const styles = useStyles()
  const t = useT()
  return (
    <Field label={label} size="small" className={styles.filterField}>
      <Select size="small" value={value} onChange={(_, d) => onChange(d.value)}>
        <option value="">{t('すべて', 'All')}</option>
        {options.map((o) => (
          <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
        ))}
      </Select>
    </Field>
  )
}

function App() {
  const styles = useStyles()
  const t = useT()
  const lang = useLang()
  const [cards, setCards] = useState<Cr854_deliverycards[]>([])
  const [products, setProducts] = useState<Cr854_products[]>([])
  const [heroes, setHeroes] = useState<Cr854_heroimages[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState<Date | null>(null)
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 新規作成中なら、最初に入れておく値(null は新規作成していない)
  const [creating, setCreating] = useState<NewCardDefaults | null>(null)

  // 配信カードごとの掲載商品の数(一覧の「商品数」「工程」と、締め切りの警告に使う。候補の行は数えない)
  const [productCounts, setProductCounts] = useState<Map<string, number>>(new Map())
  const [view, setView] = useState<View>(() => loadPref<View>(VIEW_KEY, 'month'))
  const [columns, setColumns] = useState<ColumnKey[]>(() => loadPref<ColumnKey[]>(COLUMNS_KEY, DEFAULT_COLUMNS))

  const load = useCallback(async () => {
    try {
      Cr854_deliveryproductsService.getAll()
        .then((res) => {
          if (!res.success) return // 数が出ないだけで、画面は使える
          const counts = new Map<string, number>()
          for (const r of res.data ?? []) {
            const id = r._cr854_deliverycard_value
            if (!id || r.cr854_state === STATE_CANDIDATE) continue
            counts.set(id, (counts.get(id) ?? 0) + 1)
          }
          setProductCounts(counts)
        })
        .catch(() => undefined)
      const res = await Cr854_deliverycardsService.getAll({ orderBy: ['cr854_scheduledat asc'] })
      if (!res.success) throw new Error(res.error?.message ?? tr('配信カードの取得に失敗しました', 'Failed to load delivery cards'))
      const data = res.data ?? []
      setCards(data)
      setError(null)
      // 初回のみ、最初の配信がある月(なければ今月)を表示する
      setMonth((m) => {
        if (m) return m
        const first = data.find((c) => c.cr854_scheduledat)?.cr854_scheduledat
        const base = first ? new Date(first) : new Date()
        return new Date(base.getFullYear(), base.getMonth(), 1)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    Cr854_productsService.getAll({ orderBy: ['cr854_productcode asc'] })
      .then((res) => {
        if (res.success) setProducts((res.data ?? []).map(withProductLabels))
        else setError(res.error?.message ?? tr('商品の取得に失敗しました', 'Failed to load products'))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    Cr854_heroimagesService.getAll({ orderBy: ['cr854_imagecode asc'] })
      .then((res) => {
        if (res.success) setHeroes((res.data ?? []).map(withHeroLabels))
        else setError(res.error?.message ?? tr('メイン画像の取得に失敗しました', 'Failed to load hero images'))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [load])

  const filtered = useMemo(() => {
    const match = (f: string, v?: number) => f === '' || String(v) === f
    return cards.filter(
      (c) =>
        match(filters.country, c.cr854_country) &&
        match(filters.channel, c.cr854_channel) &&
        match(filters.department, c.cr854_department) &&
        match(filters.status, c.cr854_status),
    )
  }, [cards, filters])

  // 表示中の月の配信(一覧と CSV の対象)。締め切りの警告は、月をまたいで求める(カレンダーの前後の月の日付にも出す)
  const rows = useMemo(() => toRows(filtered, productCounts), [filtered, productCounts])
  const monthRows = useMemo(
    () =>
      rows.filter((r) => {
        if (!month || !r.card.cr854_scheduledat) return false
        const d = new Date(r.card.cr854_scheduledat)
        return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
      }),
    [rows, month],
  )
  const dueSoon = useMemo(() => new Set(rows.filter((r) => r.dueSoon).map((r) => r.card.cr854_deliverycardid)), [rows])
  const changeView = (v: View) => {
    setView(v)
    savePref(VIEW_KEY, v)
  }
  const toggleColumn = (key: ColumnKey, on: boolean) => {
    // 少なくとも 1 列は残す(配信名は、行を見分けるために外せない)
    const next = COLUMNS.map((c) => c.key).filter((k) => k === 'name' || (k === key ? on : columns.includes(k)))
    setColumns(next)
    savePref(COLUMNS_KEY, next)
  }
  const exportCsv = () => {
    if (!month) return
    const pad = (n: number) => String(n).padStart(2, '0')
    // 書き出す列: 一覧では、表示中の列。カレンダーでは、すべての列
    downloadCsv(monthRows, view === 'list' ? columns : DEFAULT_COLUMNS, `deliveries-${month.getFullYear()}-${pad(month.getMonth() + 1)}.csv`)
  }

  const selected = cards.find((c) => c.cr854_deliverycardid === selectedId)
  const shift = (n: number) => month && setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const setFilter = (k: keyof Filters) => (v: string) => setFilters({ ...filters, [k]: v })
  const [autoDraft, setAutoDraft] = useState(loadAutoDraft)
  useTemplates() // テンプレートの登録が変わったら、画面全体を描き直す
  // ユーザーが作ったテンプレートを読み込む(読めなくても、標準のテンプレートで動く)
  useEffect(() => {
    loadCustomTemplates().catch(() => undefined)
  }, [])
  const filtering = Object.values(filters).some((v) => v !== '')
  // 新規作成の初期値: 絞り込み中の国・チャネル・種別を引き継ぐ(その条件の配信を作ることが多いため)
  const newCardDefaults = (scheduledAt?: string): NewCardDefaults => ({
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(filters.country ? { country: filters.country } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.department ? { department: filters.department } : {}),
  })

  return (
    <>
      <TemplateManager />
      <header className={styles.header}>
        <CalendarLtrRegular fontSize={24} className={styles.headerIcon} />
        <h1 className={styles.title}>{t('配信カレンダー', 'Delivery Calendar')}</h1>
        <Button appearance="subtle" size="small" icon={<LayoutColumnTwoRegular />} onClick={openTemplateManager}>
          {t('テンプレート', 'Templates')}
        </Button>
        <div className={styles.langSwitch} role="group" aria-label={t('言語', 'Language')}>
          {([['ja', '日本語'], ['en', 'English']] as const).map(([l, name]) => (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={lang === l}
              className={mergeClasses(styles.langBtn, lang === l && styles.langBtnOn)}
              onClick={() => setLang(l)}
            >
              {name}
            </button>
          ))}
        </div>
        <Tooltip
          content={t('内容が空の配信カードを開いたとき、AIが自動で下書きを作ります(同じカードでは1回だけ)', 'When you open an empty delivery card, AI drafts its content automatically (once per card)')}
          relationship="description"
        >
          <button
            type="button"
            role="switch"
            aria-checked={autoDraft}
            className={styles.autoDraft}
            onClick={() => {
              setAutoDraft(!autoDraft)
              saveAutoDraft(!autoDraft)
            }}
          >
            <span className={mergeClasses(styles.track, autoDraft && styles.trackOn)}>
              <span className={mergeClasses(styles.thumb, autoDraft && styles.thumbOn)} />
            </span>
            {t('開いたとき自動で下書き', 'Auto-draft on open')}
            <span className={styles.autoDraftState}>{autoDraft ? t('オン', 'On') : t('オフ', 'Off')}</span>
          </button>
        </Tooltip>
        <Button appearance="primary" size="small" icon={<AddRegular />} onClick={() => setCreating(newCardDefaults())}>
          {t('新規作成', 'New')}
        </Button>
      </header>
      <div className={mergeClasses(styles.container, view === 'list' && styles.containerWide)}>
        {loading && <div className={styles.center}><Spinner /></div>}
        {error && (
          <MessageBar layout="multiline" intent="error" className={styles.alert}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        {!loading && !error && month && (
          <>
            <div className={styles.filterRow}>
              <FilterSelect label={t('国', 'Country')} value={filters.country} options={countryOptions} onChange={setFilter('country')} />
              <FilterSelect label={t('チャネル', 'Channel')} value={filters.channel} options={channelOptions} onChange={setFilter('channel')} />
              <FilterSelect label={t('種別', 'Type')} value={filters.department} options={departmentOptions} onChange={setFilter('department')} />
              <FilterSelect label={t('ステータス', 'Status')} value={filters.status} options={statusOptions} onChange={setFilter('status')} />
              {filtering && <Button size="small" appearance="subtle" onClick={() => setFilters(noFilter)}>{t('クリア', 'Clear')}</Button>}
              <span className={styles.count}>{t(`${filtered.length} / ${cards.length} 件`, `${filtered.length} / ${cards.length} items`)}</span>
            </div>
            <div className={styles.monthRow}>
              <Button appearance="subtle" size="small" icon={<ChevronLeftRegular />} onClick={() => shift(-1)} aria-label={t('前の月', 'Previous month')} />
              <span className={styles.monthLabel}>{lang === 'ja' ? `${month.getFullYear()}年${month.getMonth() + 1}月` : month.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}</span>
              <Button appearance="subtle" size="small" icon={<ChevronRightRegular />} onClick={() => shift(1)} aria-label={t('次の月', 'Next month')} />
              <div className={styles.viewSwitch} role="group" aria-label={t('表示', 'View')}>
                <ToggleButton size="small" checked={view === 'month'} appearance={view === 'month' ? 'primary' : 'subtle'} onClick={() => changeView('month')}>
                  {t('月', 'Month')}
                </ToggleButton>
                <ToggleButton size="small" checked={view === 'list'} appearance={view === 'list' ? 'primary' : 'subtle'} onClick={() => changeView('list')}>
                  {t('一覧', 'List')}
                </ToggleButton>
              </div>
              {view === 'list' && (
                <Menu
                  checkedValues={{ columns }}
                  onCheckedValueChange={(_, d) => {
                    const added = d.checkedItems.find((k) => !columns.includes(k as ColumnKey))
                    const removed = columns.find((k) => !d.checkedItems.includes(k))
                    if (added) toggleColumn(added as ColumnKey, true)
                    else if (removed) toggleColumn(removed, false)
                  }}
                >
                  <MenuTrigger disableButtonEnhancement>
                    <Button size="small" appearance="subtle" icon={<ColumnTripleRegular />}>{t('列', 'Columns')}</Button>
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      {COLUMNS.map((c) => (
                        <MenuItemCheckbox key={c.key} name="columns" value={c.key} disabled={c.key === 'name'}>
                          {c.label()}
                        </MenuItemCheckbox>
                      ))}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              )}
              <Tooltip content={t('表示中の月の配信を、CSV で書き出します(絞り込みを反映)', "Export this month's deliveries as CSV (filters applied)")} relationship="description">
                <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} onClick={exportCsv} disabled={monthRows.length === 0}>
                  {t('CSV で書き出す', 'Export CSV')}
                </Button>
              </Tooltip>
              <div className={styles.legend}>
                {statusOptions.map((o) => (
                  <span key={o.value} className={styles.legendPill}>
                    <span className={styles.legendDot} style={{ backgroundColor: statusColor(o.value) }} />
                    {optionLabel(o.label)}
                  </span>
                ))}
              </div>
            </div>
            {/* 日付から作るときは、その日の 10:00 を配信日時にする(過去の日付でも作れる) */}
            {view === 'list' ? (
              <ListView rows={monthRows} columns={columns} onSelect={setSelectedId} />
            ) : (
              <Calendar month={month} cards={filtered} dueSoon={dueSoon} onSelect={setSelectedId} onCreate={(day) => setCreating(newCardDefaults(`${day}T10:00`))} />
            )}
          </>
        )}
      </div>
      {(selected || creating) && (
        <CardDetail
          key={selected?.cr854_deliverycardid ?? 'new'}
          card={selected}
          defaults={creating ?? undefined}
          products={products}
          heroes={heroes}
          otherThemes={cards.filter((c) => c.cr854_deliverycardid !== selected?.cr854_deliverycardid && c.cr854_theme).map((c) => c.cr854_theme!)}
          owners={[...new Set(cards.flatMap((c) => [c.cr854_owner?.trim(), c.cr854_productionowner?.trim()]).filter((o): o is string => !!o))].sort()}
          onBack={() => {
            setSelectedId(null)
            setCreating(null)
          }}
          onSaved={load}
        />
      )}
    </>
  )
}

export default App
