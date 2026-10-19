import { Fragment, useRef, useState, type ReactNode } from 'react'
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
  Field,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  type MenuButtonProps,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Radio,
  RadioGroup,
  Select,
  Spinner,
  SplitButton,
  ToggleButton,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import {
  ArrowLeftRegular,
  ArrowRightRegular,
  CalendarLtrRegular,
  CheckmarkCircleFilled,
  CheckmarkRegular,
  DeleteRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  ArrowSwapRegular,
  WarningFilled,
  DismissRegular,
  EditRegular,
  ErrorCircleRegular,
  LockClosedRegular,
  SaveRegular,
} from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { locale, optionLabel, useT } from './i18n'
import { AiIcon } from './AiMark'
import { ChannelBadge } from './ChannelBadge'
import { CheckView } from './CheckDrawer'
import { channelOptions, countryOptions } from './status'
import { THEME_TYPES, themeTypeLabel, type ThemeType } from './themeTypes'
import { dayKeyOf } from './weekLock'
import type { BulkWorkspaceState, ReviewItem, Step } from './useBulkWorkspace'
import { ImageThumb } from './ImageThumb'
import { productImage } from './images'
import { yen } from './items'
import { productMarket } from './market'
import { WEEKLY_PRODUCT_LIMIT } from './reviewChecks'
import { ReplacePicker } from './ReplacePicker'
import type { StockModel } from './alerts'

const useStyles = makeStyles({
  // 配信カード・アラートと同じ、全画面に近いフロート。カレンダーの上に重ね、閉じれば元の場所に戻る
  surface: {
    width: 'min(1400px, 96vw)',
    maxWidth: 'none',
    height: '92vh',
    maxHeight: '92vh',
    padding: 0,
    overflow: 'hidden',
    display: 'grid',
    gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  head: { display: 'flex', alignItems: 'center', columnGap: '10px', padding: '14px 20px 10px', backgroundColor: tokens.colorNeutralBackground1 },
  title: { margin: 0, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  summary: { fontSize: '12px', color: tokens.colorNeutralForeground2 },
  spacer: { flexGrow: 1 },
  // 手順。いまの手順を太く、済んだ手順に ✓。押すと、済んだ手順に戻れる
  steps: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    rowGap: '6px',
    flexWrap: 'wrap',
    padding: '8px 20px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  stepBtn: { minWidth: 0, fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3 },
  stepNow: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  stepDone: { color: tokens.colorNeutralForeground2 },
  stepNum: {
    display: 'inline-grid',
    placeItems: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    fontSize: '11px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  stepNumNow: { backgroundColor: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundOnBrand, border: `1px solid ${tokens.colorBrandBackground}` },
  stepLine: { width: '24px', height: '1px', backgroundColor: tokens.colorNeutralStroke2 },
  doneIcon: { color: tokens.colorPaletteGreenForeground1 },
  body: { minHeight: 0, overflowY: 'auto', padding: '16px 20px' },
  msg: { marginBottom: '12px' },
  // 作る手順の横に、その週にもうある配信(見るだけ)。重なりを見ながら決められるように
  withSide: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', columnGap: '20px', alignItems: 'start', '@media (max-width: 899px)': { gridTemplateColumns: '1fr', rowGap: '16px' } },
  main: { display: 'grid', rowGap: '14px', minWidth: 0 },
  panel: { display: 'grid', rowGap: '10px', padding: '14px 16px', borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  h3: { margin: 0, fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  hint: { fontSize: '12px', color: tokens.colorNeutralForeground2 },
  label: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', alignItems: 'end', columnGap: '16px', rowGap: '8px', flexWrap: 'wrap' },
  weekPick: { display: 'inline-flex', alignItems: 'center', columnGap: '2px' },
  weekText: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold, minWidth: '150px', textAlign: 'center' },
  field: { minWidth: '220px' },
  radios: { '& label': { whiteSpace: 'nowrap' } },
  // ① の 7 日の表(作る日のチェック・配信日・種類・配信名)。作れない日も並べ、薄くして理由を出す
  table: { display: 'grid', rowGap: '4px' },
  thead: { display: 'grid', gridTemplateColumns: '28px 100px minmax(0, 1fr)', columnGap: '8px', padding: '0 8px' },
  tr: {
    display: 'grid',
    gridTemplateColumns: '28px 100px minmax(0, 1fr)',
    columnGap: '8px',
    alignItems: 'center',
    minHeight: '36px',
    padding: '4px 8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  chips: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '4px', rowGap: '4px' },
  chip: { minWidth: 0, fontSize: '12px', fontWeight: tokens.fontWeightRegular },
  dayOff: { backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForegroundDisabled },
  dayOn: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  dayDate: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold },
  dayNote: { fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // AI でまとめて入れる帯
  aiBar: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '12px',
    rowGap: '8px',
    flexWrap: 'wrap',
    padding: '10px 12px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  aiText: { display: 'grid', rowGap: '2px', flexGrow: 1, flexBasis: '280px', minWidth: 0 },
  aiTitle: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  plainRow: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, minWidth: 0 },
  // ② の表
  grid3: { display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr) minmax(0, 1.2fr)', columnGap: '10px', rowGap: '10px', alignItems: 'center' },
  th: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  cellDate: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, paddingTop: '6px' },
  nameCell: { display: 'grid', rowGap: '2px', minWidth: 0 },
  nameLine: { display: 'flex', columnGap: '4px', minWidth: 0 },
  grow: { flexGrow: 1, minWidth: 0 },
  reason: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
  name: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  status: { display: 'grid', rowGap: '3px', fontSize: '12px', color: tokens.colorNeutralForeground2, minWidth: 0 },
  statusLine: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  error: { color: tokens.colorPaletteRedForeground1 },
  // 右の、その週の配信
  side: { display: 'grid', rowGap: '8px', padding: '12px 14px', borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, position: 'sticky', top: 0 },
  sideDay: { display: 'grid', rowGap: '3px' },
  sideItem: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: '12px', minWidth: 0 },
  sideName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  newBadge: { flexShrink: 0, whiteSpace: 'nowrap' },
  sidePlanned: { display: 'grid', rowGap: '2px', padding: '4px 6px', borderRadius: tokens.borderRadiusMedium, border: `1.5px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, minWidth: 0 },
  muted: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
  // ④ 左に作った配信、右に中身
  check: { display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', columnGap: '16px', alignItems: 'start', minHeight: 0, '@media (max-width: 899px)': { gridTemplateColumns: '1fr', rowGap: '12px' } },
  list: { display: 'grid', rowGap: '4px' },
  item: {
    display: 'grid',
    rowGap: '2px',
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    minWidth: 0,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemOn: { border: `1.5px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  itemOff: { opacity: 0.6 },
  thumbs: { display: 'flex', alignItems: 'center', columnGap: '3px', minHeight: '36px' },
  // ③ の右: 題名の帯 → 選んだ商品 → タブ → 中身 → 決めるボタン
  reviewPanel: { display: 'grid', rowGap: '12px', padding: '16px 18px', borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  reviewHead: { display: 'grid', rowGap: '4px', paddingBottom: '10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  reviewMeta: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: '12px', color: tokens.colorNeutralForeground2 },
  reviewTitle: { margin: 0, fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500, fontWeight: tokens.fontWeightSemibold },
  picked: { display: 'grid', rowGap: '6px' },
  pickedRow: { display: 'flex', columnGap: '10px', rowGap: '8px', flexWrap: 'wrap' },
  pickedItem: { display: 'grid', rowGap: '2px', width: '110px', fontSize: '12px', alignContent: 'start' },
  pickedName: { fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // 週の上限を超えた商品は、赤い枠と ⚠(色だけに頼らない)
  pickedOver: { outline: `1.5px solid ${tokens.colorPaletteRedBorder2}`, outlineOffset: '3px', borderRadius: tokens.borderRadiusSmall },
  uses: { display: 'inline-flex', alignItems: 'center', columnGap: '3px', fontSize: '11px', color: tokens.colorNeutralForeground3 },
  usesOver: { color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  overlap: { display: 'flex', alignItems: 'baseline', columnGap: '10px', flexWrap: 'wrap', fontSize: '12px', padding: '6px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  overlapWarn: { backgroundColor: tokens.colorPaletteYellowBackground1, color: tokens.colorPaletteDarkOrangeForeground1 },
  reviewBody: { minWidth: 0 },
  footCurrent: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, maxWidth: '40%' },
  footHint: { fontSize: '12px', color: tokens.colorNeutralForeground2, textAlign: 'right' },
  askSurface: { maxWidth: '520px', '& button': { whiteSpace: 'nowrap' } },
  // ① 右の、もうある配信は薄く(作る予定の破線のカードを目立たせる)
  sideOld: { opacity: 0.5 },
  itemHead: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  tools: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  foot: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '10px 20px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
})

interface Props {
  ws: BulkWorkspaceState
  /** すべての配信(取りやめを除く) */
  cards: DeliveryCard[]
  products: Product[]
  heroes: HeroImage[]
  /** 配信カードを開いて直す(作業画面の上に重なる) */
  onOpen: (id: string) => void
  /** まだ保存していない案を、配信カードで開く(配信カードで保存したときに、はじめて保存される) */
  onOpenDraft: (day: string) => void
  /** 在庫の見込み(週の上限を超えた商品の差し替えの候補を選ぶのに使う。まだ読めていなければ、差し替えは出さない) */
  model?: StockModel
  /** 終えて、作った週の週表示に移る */
  onFinish: (weekStart: Date) => void
}

/**
 * まとめて作る作業画面(W14 の作り直し。2026-10-19)。
 * 週の表示の上で作る形(「この週の枠を作る」)は比較のために残し、こちらは作業をこの画面で完結させる:
 * ① 対象と方向(週・国・チャネル、作る日と、その日の種類・配信名) → ② 中身を AI で作る → ③ 確かめる。
 * ① は保存しない。② で中身ができた配信から、ふつうの下書き(未起案)として保存する。
 * ① のあと、中身を作らずに保存することもできる(1 本ずつ新規作成して、中身を入れずに保存したのと同じ)
 */
export function BulkWorkspace({ ws, cards, products, heroes, onOpen, onOpenDraft, onFinish, model }: Props) {
  const s = useStyles()
  const t = useT()
  // 「終えて、週の表示で見る」から閉じようとしたか(閉じるダイアログで決めたあとも、週の表示に移るため)
  const finishRef = useRef(false)
  // 差し替えの候補を開いている商品(選んだら閉じる)
  const [replacing, setReplacing] = useState<string | null>(null)
  const dayText = (key: string) => new Date(`${key}T00:00`).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })
  const f = (d: Date) => d.toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })
  const weekEnd = new Date(ws.weekStart.getFullYear(), ws.weekStart.getMonth(), ws.weekStart.getDate() + 6)
  const weekText = `${f(ws.weekStart)} – ${f(weekEnd)}`
  const optionText = (opts: { value: string; label: string }[], v: string) => optionLabel(opts.find((o) => String(o.value) === v)?.label)
  const channelName = optionText(channelOptions, ws.channel)
  const countryName = ws.country ? optionText(countryOptions, ws.country) : t('国は未設定', 'No country')
  const n = ws.targets.length
  const readyCount = ws.targets.filter(ws.ready).length

  // ---- 手順
  const stepNames: Record<Step, string> = {
    1: t('対象と方向を決める', 'Target & direction'),
    2: t('中身を AI で作る', 'Create with AI'),
    3: t('確かめて保存', 'Review & save'),
  }
  // 中身を作らずに保存したときは、② ③ は通らない
  const plainDone = ws.plainCards.length > 0 || ws.savingPlain
  // 戻れるのは、済んだ手順だけ。中身を作り始めたら、① には戻らない(作った案と、行の対応がずれるため)
  const reachable = (k: Step) => {
    if (ws.running || plainDone) return k === ws.step
    if (k === 1) return !ws.started
    if (k === 2) return ws.started
    return ws.reviewItems.length > 0
  }
  const stepDone = (k: Step) => k < ws.step || (k === 1 && plainDone) || (k === 2 && ws.results.size > 0 && ws.pending.length === 0) || (k === 3 && ws.reviewItems.length > 0 && ws.unsavedCount === 0)
  const stepper = (
    <nav className={s.steps} aria-label={t('手順', 'Steps')}>
      {([1, 2, 3] as Step[]).map((k) => (
        <Fragment key={k}>
          {k > 1 && <span className={s.stepLine} />}
          <Button
            appearance="transparent"
            size="small"
            className={mergeClasses(s.stepBtn, k === ws.step && !plainDone && s.stepNow, stepDone(k) && k !== ws.step && s.stepDone)}
            disabled={!reachable(k)}
            aria-current={k === ws.step ? 'step' : undefined}
            onClick={() => ws.setStep(k)}
            icon={stepDone(k) && (k !== ws.step || plainDone) ? <CheckmarkCircleFilled className={s.doneIcon} /> : <span className={mergeClasses(s.stepNum, k === ws.step && s.stepNumNow)}>{k}</span>}
          >
            {stepNames[k]}
            {k === 1 && n > 0 && !plainDone ? ` (${readyCount}/${n})` : ''}
            {k === 2 && plainDone ? ` — ${t('作らずに保存', 'skipped')}` : k === 2 && n > 0 && ws.started ? ` (${ws.results.size}/${n})` : ''}
            {k === 3 && ws.reviewItems.length > 0 ? ` (${t('保存', 'saved')} ${ws.savedCount}/${ws.reviewItems.length})` : ''}
          </Button>
        </Fragment>
      ))}
    </nav>
  )

  // ---- 右: その週の配信(見るだけ。作ろうとしている行も、薄く重ねて見せる)
  const weekEndNext = new Date(ws.weekStart.getFullYear(), ws.weekStart.getMonth(), ws.weekStart.getDate() + 7)
  const inWeek = cards.filter((c) => c.scheduled_at && new Date(c.scheduled_at) >= ws.weekStart && new Date(c.scheduled_at) < weekEndNext)
  const madeIds = new Set([...ws.savedIds.values(), ...ws.plainCards.map((c) => c.id)])
  const side = (
    <aside className={s.side} aria-label={t('この週の配信', 'Deliveries this week')}>
      <h3 className={s.h3}>{t('この週の配信(すべての国・チャネル)', 'This week (all countries & channels)')}</h3>
      {ws.days.map((d) => {
        const list = inWeek.filter((c) => dayKeyOf(new Date(c.scheduled_at!)) === d.key).sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
        const planned = ws.targets.includes(d.key) && !list.some((c) => madeIds.has(c.id))
        return (
          <div key={d.key} className={s.sideDay}>
            <span className={s.label}>{dayText(d.key)}</span>
            {list.length === 0 && !planned && <span className={s.muted}>—</span>}
            {list.map((c) => (
              <span key={c.id} className={mergeClasses(s.sideItem, !madeIds.has(c.id) && s.sideOld)}>
                <ChannelBadge channel={c.channel} size="small" />
                <span className={s.sideName}>{c.name || t('(配信名なし)', '(no name)')}</span>
                {/* すべての国を出すので、① の国と違う配信だと分かるように */}
                {c.country && <span className={s.muted}>{c.country}</span>}
                {madeIds.has(c.id) && <Badge size="small" appearance="tint" color="brand" className={s.newBadge}>{t('いま作った', 'New')}</Badge>}
              </span>
            ))}
            {/* 作る予定は、破線の小さなカードにして、もうある配信(線なし)と形で分ける。種類も出す */}
            {planned && (
              <span className={s.sidePlanned}>
                <span className={s.sideItem}>
                  <Badge size="small" appearance="filled" color="brand" className={s.newBadge}>
                    {t('作る予定', 'Planned')}
                  </Badge>
                  <ChannelBadge channel={ws.channel} size="small" />
                  <span className={s.sideName}>{ws.rowOf(d.key).name || t('(配信名はまだ)', '(no name yet)')}</span>
                </span>
                {ws.rowOf(d.key).themeType && <span className={s.muted}>{themeTypeLabel(ws.rowOf(d.key).themeType as ThemeType)}</span>}
              </span>
            )}
          </div>
        )
      })}
    </aside>
  )

  // ---- ① 対象と方向(週・国・チャネル、作る日と、その日の配信名・種類を、1 つの表で)
  const step1 = () => {
    const locked = ws.days.some((d) => d.state === 'locked')
    // AI でまとめて入れる行(種類か配信名が空)
    const unfilled = ws.targets.filter((d) => !ws.rowOf(d).name.trim() || !ws.rowOf(d).themeType)
    const note = (d: (typeof ws.days)[number]): string => {
      if (d.state === 'locked') return t('確定した週', 'Confirmed week')
      if (d.state === 'past') return t('過ぎた日', 'Past')
      return t(`${channelName}あり: ${d.same.map((x) => x.name || '(配信名なし)').join('、')}`, `Has ${channelName}: ${d.same.map((x) => x.name || '(no name)').join(', ')}`)
    }
    return (
      <div className={s.main}>
        <section className={s.panel}>
          <div className={s.row}>
            <Field label={t('週', 'Week')}>
              <span className={s.weekPick}>
                <Button appearance="subtle" size="small" icon={<ChevronLeftRegular />} aria-label={t('前の週', 'Previous week')} onClick={() => ws.moveWeek(-1)} />
                <span className={s.weekText}>{weekText}</span>
                <Button appearance="subtle" size="small" icon={<ChevronRightRegular />} aria-label={t('次の週', 'Next week')} onClick={() => ws.moveWeek(1)} />
              </span>
            </Field>
            <Field label={t('国', 'Country')} className={s.field}>
              <Select size="small" value={ws.country} onChange={(_, v) => ws.setCountry(v.value)}>
                <option value="">{t('未設定(すべての市場の商品を使う)', 'Not set (use products of all markets)')}</option>
                {countryOptions.map((o) => (
                  <option key={o.value} value={String(o.value)}>
                    {optionLabel(o.label)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('チャネル', 'Channel')} className={s.radios}>
              <RadioGroup layout="horizontal" value={ws.channel} onChange={(_, v) => ws.setChannel(v.value)}>
                {channelOptions.map((o) => (
                  <Radio key={o.value} value={String(o.value)} label={optionLabel(o.label)} />
                ))}
              </RadioGroup>
            </Field>
          </div>
        </section>
        <section className={s.panel}>
          <h3 className={s.h3}>{t('作る日と、配信の方向', 'Days and direction')}</h3>
          <span className={s.hint}>
            {locked
              ? t('この週は確定しています。‹ › で、別の週を選んでください。', 'This week is confirmed. Use ‹ › to pick another week.')
              : t(
                  `${channelName}がまだない日(今日以降)に、1 日 1 本ずつ作ります。作る日にチェックを入れ、種類と配信名を入れてください。ここではまだ保存しません。`,
                  `One delivery per day on days without ${channelName} (from today). Check the days, then enter a type and a name. Nothing is saved yet.`,
                )}
          </span>
          {/* AI でまとめて入れる。表の上に、何をするかを書いた帯で出す(小さなボタンだけだと、何が起きるか分からないため) */}
          <div className={s.aiBar}>
            <AiIcon size={20} />
            <div className={s.aiText}>
              <span className={s.aiTitle}>{t('種類と配信名を AI でまとめて入れる', 'Fill types and names with AI')}</span>
              <span className={s.hint}>
                {t(
                  '作る日のうち、種類か配信名が空の行に、日付・前後の配信に合う案を入れます。人が選んだ種類・入れた配信名は変えません。入れたあとで、書き換えられます。',
                  'Fills empty types and names with ideas that fit the date and nearby deliveries. Types and names you entered stay as they are. You can change them afterwards.',
                )}
              </span>
            </div>
            <Button appearance="primary" icon={ws.naming.size > 0 ? <Spinner size="extra-tiny" /> : <AiIcon tone="white" />} disabled={unfilled.length === 0 || ws.naming.size > 0} onClick={() => void ws.suggest(unfilled, true)}>
              {unfilled.length > 0 ? t(`空いている ${unfilled.length} 行に入れる`, `Fill ${unfilled.length} rows`) : t('空いている行はありません', 'Nothing to fill')}
            </Button>
          </div>
          <div className={s.table} role="table">
            <div className={s.thead} role="row">
              <span />
              <span className={s.th}>{t('配信日', 'Date')}</span>
              <span className={s.th}>{t('配信名と種類', 'Name & type')}</span>
            </div>
            {ws.days.map((d) => {
              const free = d.state === 'free'
              const on = free && ws.chosen.has(d.key)
              const r = ws.rowOf(d.key)
              const busy = ws.naming.has(d.key)
              return (
                <div key={d.key} className={mergeClasses(s.tr, !free && s.dayOff, on && s.dayOn)} role="row">
                  {free ? <Checkbox checked={on} onChange={(_, v) => ws.toggleDay(d.key, !!v.checked)} aria-label={t(`${dayText(d.key)} に作る`, `Create on ${dayText(d.key)}`)} /> : d.state === 'locked' ? <LockClosedRegular /> : <span />}
                  <span className={s.dayDate}>{dayText(d.key)}</span>
                  {!free ? (
                    <span className={s.dayNote}>{note(d)}</span>
                  ) : !on ? (
                    <span className={mergeClasses(s.dayNote, s.muted)}>{t('作らない', 'Skip')}</span>
                  ) : (
                    <div className={s.nameCell}>
                      <div className={s.nameLine}>
                        <Input size="small" className={s.grow} value={r.name} placeholder={t('配信名', 'Delivery name')} onChange={(_, v) => ws.setRow(d.key, { name: v.value, nameReason: undefined })} aria-label={t('配信名', 'Name')} />
                        <Button size="small" appearance="subtle" icon={busy ? <Spinner size="extra-tiny" /> : <AiIcon />} disabled={busy} title={t('この行に配信名の案', 'Suggest a name for this row')} aria-label={t('この行に配信名の案', 'Suggest a name for this row')} onClick={() => void ws.suggest([d.key])} />
                      </div>
                      {/* 種類は、選ぶ一覧ではなく、押すだけのチップ(1 行ずつ一覧を開く手間を減らす。もう一度押すと外れる) */}
                      <div className={s.chips} role="radiogroup" aria-label={t('種類', 'Type')}>
                        {THEME_TYPES.map((k) => {
                          const sel = r.themeType === k
                          return (
                            <ToggleButton
                              key={k}
                              size="small"
                              shape="circular"
                              appearance={sel ? 'primary' : 'outline'}
                              checked={sel}
                              role="radio"
                              aria-checked={sel}
                              className={s.chip}
                              onClick={() => ws.setRow(d.key, { themeType: sel ? '' : k, typeByAi: false })}
                            >
                              {themeTypeLabel(k)}
                            </ToggleButton>
                          )
                        })}
                        {r.typeByAi && r.themeType && <span className={s.reason}>{t('種類は AI の案', 'Type suggested by AI')}</span>}
                      </div>
                      {r.nameReason && <span className={s.reason}>{`${t('案の理由', 'Why')}: ${r.nameReason}`}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    )
  }

  // ---- 中身を作らずに保存したあと
  const plainView = () => (
    <div className={s.main}>
      <section className={s.panel}>
        <h3 className={s.h3}>
          {ws.savingPlain ? t('保存しています', 'Saving') : t(`${ws.plainCards.length} 本を、中身のない下書き(未起案)で保存しました`, `Saved ${ws.plainCards.length} as drafts without content (Not started)`)}
        </h3>
        <span className={s.hint}>
          {t(
            '1 本ずつ新規作成して、中身を入れずに保存したのと同じです。中身は、配信カードを開いて作ってください(配信カードの「すべて AI で下書き」も使えます)。',
            'Same as creating each one and saving without content. Open each delivery card to create the content (“Draft all with AI” is available there).',
          )}
        </span>
        <div className={s.list}>
          {ws.plainCards.map((c) => (
            <div key={c.id} className={s.plainRow}>
              <ChannelBadge channel={c.channel} size="small" />
              <span className={s.dayDate}>{c.scheduled_at ? dayText(dayKeyOf(new Date(c.scheduled_at))) : ''}</span>
              <span className={s.name}>{c.name}</span>
              <span className={s.muted}>{c.theme_type ? themeTypeLabel(c.theme_type as ThemeType) : ''}</span>
              <span className={s.spacer} />
              <Button size="small" icon={<EditRegular />} onClick={() => onOpen(c.id)}>
                {t('開く', 'Open')}
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )

  // ---- ② 中身を AI で作る
  const step2 = () => {
    const failedDays = ws.targets.filter((d) => ws.failed.has(d))
    return (
      <div className={s.main}>
        <section className={s.panel}>
          <div className={s.tools}>
            <h3 className={s.h3}>{ws.running ? t('AI が中身を作っています', 'AI is creating the content') : t('中身を作りました', 'Content created')}</h3>
            <span className={s.spacer} />
            {ws.running ? (
              <Button size="small" icon={<Spinner size="extra-tiny" />} onClick={ws.stop}>
                {t('作るのをやめる', 'Stop')}
              </Button>
            ) : (
              ws.pending.length > 0 && (
                <Button size="small" icon={<AiIcon />} onClick={() => void ws.generate(ws.pending)}>
                  {failedDays.length > 0 ? t(`失敗した ${ws.pending.length} 本をやり直す`, `Retry ${ws.pending.length}`) : t(`残りの ${ws.pending.length} 本を作る`, `Create remaining ${ws.pending.length}`)}
                </Button>
              )
            )}
          </div>
          <span className={s.hint}>
            {t(
              '同時に 3 本まで作ります。できた案は、まだ保存しません。③ で中身を見て、1 本ずつ「保存」か「破棄」を選びます。',
              'Up to 3 at a time. Drafts are not saved yet: in step 3, review each one and choose Save or Discard.',
            )}
          </span>
          <div className={s.grid3}>
            {ws.targets.map((d) => {
              const r = ws.rowOf(d)
              const prog = ws.progress.get(d)
              const fail = ws.failed.get(d)
              const done = ws.results.has(d)
              return (
                <Fragment key={d}>
                  <span className={s.dayDate}>{dayText(d)}</span>
                  <span className={s.nameCell}>
                    <span className={s.name}>{r.name}</span>
                    <span className={s.reason}>{r.themeType ? themeTypeLabel(r.themeType as ThemeType) : ''}</span>
                  </span>
                  <span className={s.status}>
                    {done ? (
                      <span className={s.statusLine}>
                        <CheckmarkCircleFilled className={s.doneIcon} />
                        {t('できました(まだ保存していません)', 'Ready (not saved yet)')}
                      </span>
                    ) : prog ? (
                      <>
                        <span className={s.statusLine}>
                          <Spinner size="extra-tiny" />
                          {prog.step}
                        </span>
                        <ProgressBar value={prog.total ? prog.done / prog.total : 0} thickness="medium" />
                      </>
                    ) : fail ? (
                      <span className={mergeClasses(s.statusLine, s.error)}>
                        <ErrorCircleRegular />
                        {fail}
                      </span>
                    ) : (
                      <span className={s.statusLine}>{t('まだ作っていません', 'Not created yet')}</span>
                    )}
                  </span>
                </Fragment>
              )
            })}
          </div>
        </section>
      </div>
    )
  }

  // ---- ③ 確かめて保存(1 本ずつ、中身を見て「保存」か「破棄」。保存しなかった案は、終えると破棄される)
  const stateBadge = (state: ReviewItem['state']) =>
    state === 'saved' ? (
      <Badge size="small" appearance="tint" color="success" icon={<CheckmarkRegular />} className={s.newBadge}>
        {t('保存済み', 'Saved')}
      </Badge>
    ) : state === 'discarded' ? (
      <Badge size="small" appearance="outline" color="subtle" className={s.newBadge}>
        {t('破棄', 'Discarded')}
      </Badge>
    ) : (
      <Badge size="small" appearance="outline" color="informative" className={s.newBadge}>
        {t('未保存', 'Not saved')}
      </Badge>
    )
  const pOf = (id: string) => products.find((p) => p.id === id)
  const issueCount = (x: ReviewItem) => {
    const is = ws.issuesOf(x)
    return is.over.length + (is.sameTheme.length > 0 ? 1 : 0) + (is.sameHero.length > 0 ? 1 : 0)
  }
  // ③ でいま見ている案(下の帯の「保存」「破棄」も、この案に効く)
  const items = ws.reviewItems
  const current = items.find((x) => x.day === ws.checkDay) ?? items.find((x) => x.state === 'unsaved') ?? items[0]
  const index = current ? items.indexOf(current) : -1
  const busy = !!current && ws.savingDay === current.day
  const step3 = () => {
    if (!current) return <span className={s.muted}>{t('作った案はまだありません。', 'No drafts yet.')}</span>
    const c = current.card
    return (
      <div className={s.check}>
        <div className={s.list} role="listbox" aria-label={t('作った案', 'Drafts')}>
          {items.map((x) => (
            <button key={x.day} type="button" role="option" aria-selected={x === current} className={mergeClasses(s.item, x === current && s.itemOn, x.state === 'discarded' && s.itemOff)} onClick={() => ws.setCheckDay(x.day)}>
              <span className={s.itemHead}>
                <ChannelBadge channel={x.card.channel} size="small" />
                <span className={s.name}>{x.card.name}</span>
              </span>
              <span className={s.itemHead}>
                <span className={s.muted}>{dayText(x.day)}</span>
                <span className={s.spacer} />
                {/* 週の中で気になる点がある案は、開かなくても分かるように */}
                {issueCount(x) > 0 && (
                  <Badge size="small" appearance="tint" color="warning" icon={<WarningFilled />} className={s.newBadge}>
                    {issueCount(x)}
                  </Badge>
                )}
                {stateBadge(x.state)}
              </span>
              {/* 開かなくても、選んだ商品が分かるように、小さな写真を並べる */}
              <span className={s.thumbs}>
                {x.productIds.slice(0, 5).map((pid, i) => (
                  <ImageThumb key={`${pid}-${i}`} src={productImage(pOf(pid))} alt={pOf(pid)?.name ?? ''} width={28} height={36} />
                ))}
                {x.productIds.length > 5 && <span className={s.muted}>{`+${x.productIds.length - 5}`}</span>}
              </span>
            </button>
          ))}
        </div>
        <section className={s.reviewPanel}>
          {/* 題名の帯: 配信日・チャネル・種類の下に、配信名を大きく。タブは、その下に線で区切って置く(題名とタブを見分けやすく) */}
          <header className={s.reviewHead}>
            <div className={s.reviewMeta}>
              <ChannelBadge channel={c.channel} size="small" />
              <span>{dayText(current.day)}</span>
              {c.theme_type && <span>{`・ ${themeTypeLabel(c.theme_type as ThemeType)}`}</span>}
              <span className={s.spacer} />
              <span className={s.muted}>{t(`${index + 1} / ${items.length} 本目`, `${index + 1} of ${items.length}`)}</span>
              {stateBadge(current.state)}
              {/* 破棄は、保存(右下)から離して、案の題名の帯に置く。保存したあとでも破棄できる(保存した配信を消す) */}
              {current.state === 'discarded' ? (
                <Button size="small" appearance="subtle" onClick={() => ws.undoDiscard(current.day)}>
                  {t('破棄を取り消す', 'Undo discard')}
                </Button>
              ) : (
                <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={busy} onClick={() => void ws.discard(current.day)}>
                  {t('破棄', 'Discard')}
                </Button>
              )}
            </div>
            <h3 className={s.reviewTitle}>{c.name}</h3>
            {c.theme && <span className={s.hint}>{`${t('テーマ', 'Theme')}: ${c.theme}`}</span>}
          </header>
          {/* 選んだ商品(開かなくても分かるように) */}
          <div className={s.picked}>
            <span className={s.label}>{t(`選んだ商品(${current.productIds.length})`, `Products (${current.productIds.length})`)}</span>
            <div className={s.pickedRow}>
              {current.productIds.length === 0 && <span className={s.muted}>{t('なし', 'None')}</span>}
              {current.productIds.map((pid, i) => {
                const p = pOf(pid)
                const uses = ws.weekUse.get(pid) ?? 0
                const over = current.state !== 'discarded' && uses > WEEKLY_PRODUCT_LIMIT
                return (
                  <div key={`${pid}-${i}`} className={mergeClasses(s.pickedItem, over && s.pickedOver)}>
                    <ImageThumb src={productImage(p)} alt={p?.name ?? ''} width={56} height={72} />
                    <span className={s.pickedName}>{p?.name ?? pid}</span>
                    {p?.price !== undefined && <span className={s.muted}>{yen(p.price, productMarket(p))}</span>}
                    {/* この週に、この商品を載せる配信の数(週の確認の一覧 W4 と同じ数え方。上限を超えると ⚠) */}
                    <span className={mergeClasses(s.uses, over && s.usesOver)}>
                      {over && <WarningFilled />}
                      {t(`今週 ${uses} 本 / 上限 ${WEEKLY_PRODUCT_LIMIT}`, `${uses} this week / max ${WEEKLY_PRODUCT_LIMIT}`)}
                    </span>
                    {over &&
                      p &&
                      (current.state === 'unsaved' && model ? (
                        <Popover positioning="below-start" withArrow trapFocus open={replacing === `${current.day}:${pid}`} onOpenChange={(_, d) => setReplacing(d.open ? `${current.day}:${pid}` : null)}>
                          <PopoverTrigger disableButtonEnhancement>
                            <Button size="small" appearance="outline" icon={<ArrowSwapRegular />}>
                              {t('差し替え', 'Replace')}
                            </Button>
                          </PopoverTrigger>
                          <PopoverSurface>
                            <ReplacePicker card={c} removed={p} inCard={current.productIds} products={products} model={model} weekUse={ws.weekUse} onPick={(to) => {
                                ws.replace(current.day, pid, to)
                                setReplacing(null)
                              }}
                            />
                          </PopoverSurface>
                        </Popover>
                      ) : (
                        <span className={s.muted}>{t('「開いて編集」で直す', 'Fix via “Open & edit”')}</span>
                      ))}
                  </div>
                )
              })}
            </div>
          </div>
          {/* この週の中での重なり(週の確認の一覧と同じ見方)。なければ「重なりなし」とだけ出す */}
          {(() => {
            const is = ws.issuesOf(current)
            const notes = [
              is.sameTheme.length > 0 && t(`同じテーマ: ${is.sameTheme.join('、')}`, `Same theme: ${is.sameTheme.join(', ')}`),
              is.sameHero.length > 0 && t(`同じメイン画像: ${is.sameHero.join('、')}`, `Same hero image: ${is.sameHero.join(', ')}`),
              is.over.length > 0 && t(`週の上限を超える商品 ${is.over.length} 点`, `${is.over.length} item(s) over the weekly limit`),
            ].filter(Boolean)
            return (
              <div className={mergeClasses(s.overlap, notes.length > 0 && s.overlapWarn)}>
                <span className={s.label}>{t('この週の中での重なり', 'Overlap within this week')}</span>
                <span>{notes.length > 0 ? notes.join(' ・ ') : t('重なりなし', 'No overlap')}</span>
              </div>
            )
          })()}
          <div className={s.reviewBody}>
            <CheckView card={c} tab="content" cards={ws.compareCards} cardProducts={ws.compareProducts} products={products} heroes={heroes} />
          </div>
        </section>
      </div>
    )
  }

  // ---- 下: 戻る と、手順に合わせたボタン(① だけは、AI で作るか、作らずに保存するかの 2 つ)
  // 「終えて、週の表示で見る」で閉じたときは、閉じるダイアログで決めたあとも、週の表示に移る
  const finish = () => {
    finishRef.current = true
    if (ws.close()) onFinish(ws.weekStart)
  }
  const afterAsk = () => {
    ws.setCloseAsk(false)
    ws.closeNow()
    if (finishRef.current) onFinish(ws.weekStart)
  }
  const finishButton = (
    <Button appearance="primary" icon={<CalendarLtrRegular />} disabled={ws.savingPlain || !!ws.savingDay} onClick={finish}>
      {t('終えて、週の表示で見る', 'Finish and open the week')}
    </Button>
  )
  const actions = (): ReactNode => {
    if (plainDone) return finishButton
    if (ws.step === 1)
      return (
        // 主の道は「AI で作る」1 つ。中身なしの保存は、「新規作成 ▾」と同じく ▾ の中に置く(この画面の目的は、まとめて AI で作ることなので)
        <Menu positioning="above-end">
          <MenuTrigger disableButtonEnhancement>
            {(triggerProps: MenuButtonProps) => (
              <SplitButton
                appearance="primary"
                icon={<AiIcon tone="white" />}
                disabled={!ws.allReady && !ws.plainReady}
                primaryActionButton={{ disabled: !ws.allReady, onClick: () => void ws.generate(ws.pending) }}
                menuButton={{ ...triggerProps, 'aria-label': t('ほかの保存のしかた', 'Other ways to save') }}
              >
                {t(`${n} 本の中身を AI で作る`, `Create ${n} with AI`)}
              </SplitButton>
            )}
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem
                disabled={!ws.plainReady}
                secondaryContent={t('配信名だけで保存できます', 'Needs names only')}
                onClick={() => {
                  if (window.confirm(t(`中身は作らずに、${n} 本を下書き(未起案)で保存します。中身は、あとで配信カードで作ります。よろしいですか?`, `Save ${n} as drafts (Not started) without content? You can create the content later in each card.`))) void ws.savePlainAll()
                }}
              >
                {t(`中身は作らずに、${n} 本を下書きで保存`, `Save ${n} as drafts without content`)}
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      )
    if (ws.step === 2)
      return (
        <Button appearance="primary" icon={<ArrowRightRegular />} iconPosition="after" disabled={ws.running || ws.reviewItems.length === 0} onClick={() => ws.setStep(3)}>
          {t(`次へ: ${ws.reviewItems.length} 本を確かめて保存`, `Next: review & save ${ws.reviewItems.length}`)}
        </Button>
      )
    // ③: いま見ている案を決めるボタン(配信カードの「保存」と同じ、右下)。未保存の案がなくなったら「終える」
    if (!current) return finishButton
    const done = ws.unsavedCount === 0
    if (current.state === 'unsaved')
      return (
        <>
          {/* 保存せずに、配信カードで開く(配信カードで「保存」を押したときに、はじめて保存される) */}
          <Button icon={<EditRegular />} disabled={busy} onClick={() => onOpenDraft(current.day)}>
            {t('開いて編集', 'Open & edit')}
          </Button>
          {/* 保存の ▾ に「残りをまとめて保存」(途中で切り上げるとき。ふだんは 1 本ずつ) */}
          <Menu positioning="above-end">
            <MenuTrigger disableButtonEnhancement>
              {(triggerProps: MenuButtonProps) => (
                <SplitButton
                  appearance="primary"
                  icon={busy ? <Spinner size="tiny" /> : <SaveRegular />}
                  disabled={busy}
                  primaryActionButton={{ onClick: () => void ws.save(current.day) }}
                  menuButton={{ ...triggerProps, 'aria-label': t('ほかの保存のしかた', 'Other ways to save') }}
                >
                  {t('保存', 'Save')}
                </SplitButton>
              )}
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem
                  icon={<SaveRegular />}
                  onClick={() => {
                    if (window.confirm(t(`まだ決めていない ${ws.unsavedCount} 本を、まとめて下書き(未起案)で保存します。よろしいですか?`, `Save all ${ws.unsavedCount} remaining drafts (Not started)?`))) void ws.saveAll()
                  }}
                >
                  {t(`残りの ${ws.unsavedCount} 本をまとめて保存`, `Save all ${ws.unsavedCount} remaining`)}
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </>
      )
    return (
      <>
        {current.state === 'saved' && (
          <Button icon={<EditRegular />} onClick={() => onOpen(current.card.id)}>
            {t('開いて編集', 'Open & edit')}
          </Button>
        )}
        {done ? (
          finishButton
        ) : (
          <Button appearance="primary" icon={<ArrowRightRegular />} iconPosition="after" onClick={() => ws.setCheckDay(ws.reviewItems.find((x) => x.state === 'unsaved')?.day ?? null)}>
            {t('次の未保存の案へ', 'Next unsaved')}
          </Button>
        )}
      </>
    )
  }
  const inReview = !plainDone && ws.step === 3
  const back = inReview ? 2 : null
  // ボタンのすぐ左に置く、短い状態の説明(説明とボタンを 1 か所にまとめ、目が左下から右下へ横断しないように)
  const footHint = plainDone
    ? ''
    : ws.step === 1
      ? readyCount === n && n > 0
        ? t(`${n} 本そろいました`, `All ${n} ready`)
        : t(`種類と配信名: ${readyCount} / ${n} 本`, `Type & name: ${readyCount} / ${n}`)
      : inReview
        ? ws.unsavedCount === 0
          ? t(`保存 ${ws.savedCount} / ${ws.reviewItems.length} 本。すべて決めました`, `Saved ${ws.savedCount} of ${ws.reviewItems.length}. All decided`)
          : t(`保存 ${ws.savedCount} / ${ws.reviewItems.length} 本`, `Saved ${ws.savedCount} of ${ws.reviewItems.length}`)
        : ''

  return (
    <>
      <Dialog open={ws.open} modalType="modal" onOpenChange={(_, d) => !d.open && ws.close()}>
        <DialogSurface className={s.surface} aria-label={t('まとめて作る', 'Create in bulk')}>
          <div className={s.head}>
            <AiIcon size={20} />
            <h2 className={s.title}>{t('まとめて作る', 'Create in bulk')}</h2>
            <span className={s.summary}>{`${weekText} ・ ${countryName} ・ ${channelName}`}</span>
            <span className={s.spacer} />
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              disabled={ws.running || ws.savingPlain}
              aria-label={t('閉じる', 'Close')}
              onClick={() => {
                finishRef.current = false
                ws.close()
              }}
            />
          </div>
          {stepper}
          <div className={s.body}>
            {ws.error && (
              <MessageBar intent="error" layout="multiline" className={s.msg}>
                <MessageBarBody>{ws.error}</MessageBarBody>
              </MessageBar>
            )}
            {ws.step === 3 && !plainDone ? (
              step3()
            ) : (
              <div className={s.withSide}>
                {plainDone ? plainView() : ws.step === 1 ? step1() : step2()}
                {side}
              </div>
            )}
          </div>
          <div className={s.foot}>
            {back && (
              <Button appearance="subtle" icon={<ArrowLeftRegular />} disabled={ws.running} onClick={() => ws.setStep(back as Step)}>
                {t('戻る', 'Back')}
              </Button>
            )}
            {inReview && current && <span className={s.footCurrent}>{t(`${index + 1} / ${items.length} 本目 ・ ${current.card.name}`, `${index + 1} of ${items.length} · ${current.card.name}`)}</span>}
            <span className={s.spacer} />
            <span className={s.footHint}>{footHint}</span>
            {actions()}
          </div>
        </DialogSurface>
      </Dialog>
      {/* 保存していない案があるまま閉じるとき。選ぶのは 2 つだけ(やめるときは × で、作業画面に戻る) */}
      <Dialog open={ws.closeAsk} modalType="alert" onOpenChange={(_, d) => !d.open && ws.setCloseAsk(false)}>
        <DialogSurface className={s.askSurface}>
          <DialogBody>
            <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label={t('作業画面に戻る', 'Back to the workspace')} onClick={() => ws.setCloseAsk(false)} />}>
              {t(`保存していない案が ${ws.unsavedCount} 本あります`, `${ws.unsavedCount} draft(s) not saved`)}
            </DialogTitle>
            <DialogContent>
              {t(
                '閉じる前に、残りの案をどうするか選んでください。保存した案は、下書き(未起案)になります。',
                'Choose what to do with the remaining drafts. Saved drafts become regular drafts (Not started).',
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" icon={<DeleteRegular />} disabled={!!ws.savingDay} onClick={afterAsk}>
                {t('破棄して閉じる', 'Discard and close')}
              </Button>
              <Button
                appearance="primary"
                icon={ws.savingDay ? <Spinner size="tiny" /> : <SaveRegular />}
                disabled={!!ws.savingDay}
                onClick={async () => {
                  if (await ws.saveAll()) afterAsk()
                }}
              >
                {t('まとめて保存して閉じる', 'Save all and close')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  )
}
