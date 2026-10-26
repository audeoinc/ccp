import { Fragment, useRef, type CSSProperties, type ReactNode } from 'react'
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
  InfoLabel,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  type MenuButtonProps,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Select,
  Spinner,
  SplitButton,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { ResizableSurface } from './ResizableSurface'
import {
  CalendarLtrRegular,
  CheckmarkCircleFilled,
  CheckmarkRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
  ErrorCircleRegular,
  LockClosedRegular,
  SaveRegular,
  WarningFilled,
} from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { locale, optionLabel, useT } from './i18n'
import { AiIcon } from './AiMark'
import { ChannelBadge } from './ChannelBadge'
import { CHANNEL_PUSH, channelOptions, countryOptions } from './status'
import { THEME_TYPES, themeTypeLabel, type ThemeType } from './themeTypes'
import { dayKeyOf } from './weekLock'
import { dayOfKey, timeOfKey } from './useBulkWorkspace'
import { getTemplate } from './templates'
import type { BulkWorkspaceState, ReviewItem, Step } from './useBulkWorkspace'
import { ImageThumb } from './ImageThumb'
import { heroImage, productImage } from './images'
import { Splitter } from './Splitter'
import { usePaneWidths } from './floatLayout'
import { PREF } from './prefKeys'
import { confirmDialog } from './confirm'

const useStyles = makeStyles({
  // 配信カード・アラートと同じ、全画面に近いフロート。カレンダーの上に重ね、閉じれば元の場所に戻る
  surface: {
    width: 'min(1400px, (96vw / var(--ui-zoom, 1)))',
    maxWidth: 'none',
    height: 'calc(92vh / var(--ui-zoom, 1))',
    maxHeight: 'calc(92vh / var(--ui-zoom, 1))',
    padding: 0,
    overflow: 'hidden',
    display: 'grid',
    gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  head: { display: 'flex', alignItems: 'center', columnGap: '10px', rowGap: '6px', flexWrap: 'wrap', padding: '14px 20px 10px', backgroundColor: tokens.colorNeutralBackground1 },
  title: { margin: 0, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  summary: { fontSize: '12px', color: tokens.colorNeutralForeground2 },
  spacer: { flexGrow: 1 },
  // 見出しの中の、週・国・チャネル(① で選ぶ。② では見るだけ)
  target: { display: 'inline-flex', alignItems: 'center', columnGap: '10px', rowGap: '6px', flexWrap: 'wrap' },
  weekPick: { display: 'inline-flex', alignItems: 'center', columnGap: '2px' },
  weekText: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold, minWidth: '150px', textAlign: 'center' },
  country: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  countryPick: { minWidth: '160px' },
  // 手順。いまの手順を太く、済んだ手順に ✓
  steps: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    rowGap: '6px',
    flexWrap: 'wrap',
    padding: '6px 20px 10px',
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
  // ① の横に、その週にもうある配信(見るだけ)。重なりを見ながら決められるように
  // 右の一覧の幅は usePaneWidths で変える(--cols)。狭い画面では縦に並べ、境目も出さない
  withSide: { display: 'grid', gridTemplateColumns: 'var(--cols)', columnGap: '10px', alignItems: 'start', '@media (max-width: 899px)': { gridTemplateColumns: '1fr', rowGap: '16px' } },
  main: { display: 'grid', rowGap: '14px', minWidth: 0 },
  step2: { minWidth: 0 },
  panel: { display: 'grid', rowGap: '10px', padding: '14px 16px', borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  h3: { margin: 0, fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  hint: { fontSize: '12px', color: tokens.colorNeutralForeground2 },
  label: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  channelRow: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  // ① の 7 日の表(作る日のチェック・配信日・種類・配信名)。作れない日も並べ、薄くして理由を出す
  table: { display: 'grid', rowGap: '4px' },
  thead: { display: 'grid', gridTemplateColumns: '28px 100px 160px minmax(0, 1fr)', columnGap: '8px', padding: '0 8px', alignItems: 'end' },
  tr: {
    display: 'grid',
    gridTemplateColumns: '28px 100px 160px minmax(0, 1fr)',
    columnGap: '8px',
    alignItems: 'center',
    minHeight: '36px',
    padding: '4px 8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  span2: { gridColumn: 'span 2' },
  // 作れない行(過ぎた日・型のない曜日・もうある日・確定した週)は、高さを詰めて薄く出す(作る行が埋もれないように)
  dayOff: { minHeight: '24px', paddingTop: '1px', paddingBottom: '1px', backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForegroundDisabled, border: `1px solid transparent` },
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
  aiText: { display: 'flex', alignItems: 'center', flexGrow: 1, flexBasis: '280px', minWidth: 0 },
  aiTitle: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  nameCell: { display: 'grid', rowGap: '2px', minWidth: 0 },
  nameLine: { display: 'flex', columnGap: '4px', minWidth: 0 },
  grow: { flexGrow: 1, minWidth: 0 },
  reason: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
  name: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  statusLine: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0, fontSize: '12px' },
  error: { color: tokens.colorPaletteRedForeground1 },
  // ① 右の、その週の配信
  side: { display: 'grid', rowGap: '8px', padding: '12px 14px', borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, position: 'sticky', top: 0 },
  sideDay: { display: 'grid', rowGap: '3px' },
  sideItem: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: '12px', minWidth: 0 },
  sideName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sideOld: { opacity: 0.5 },
  newBadge: { flexShrink: 0, whiteSpace: 'nowrap' },
  sidePlanned: { display: 'grid', rowGap: '2px', padding: '4px 6px', borderRadius: tokens.borderRadiusMedium, border: `1.5px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, minWidth: 0 },
  muted: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
  list: { display: 'grid', rowGap: '4px' },
  plainRow: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, minWidth: 0 },
  // ② 案のカードを並べる。中身を見る・直す場所は配信カード(「開いて編集」)にまとめ、ここでは並べて決めるだけにする
  tools: { display: 'flex', alignItems: 'center', columnGap: '8px', rowGap: '6px', flexWrap: 'wrap', marginBottom: '12px' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', alignItems: 'stretch' },
  card: {
    display: 'grid',
    gridTemplateRows: 'auto auto auto 1fr auto',
    rowGap: '6px',
    padding: '12px 14px',
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    minWidth: 0,
  },
  cardSaved: { border: `1.5px solid ${tokens.colorPaletteGreenBorder2}` },
  cardOff: { opacity: 0.55 },
  cardHead: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '6px', rowGap: '2px', fontSize: '12px', color: tokens.colorNeutralForeground2, minWidth: 0, '& > span': { whiteSpace: 'nowrap' } },
  cardTitle: { margin: 0, fontSize: '15px', fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  theme: { fontSize: '12px', color: tokens.colorNeutralForeground2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardSummary: { display: 'flex', alignItems: 'flex-start', columnGap: '8px', minWidth: 0 },
  summaryText: { display: 'grid', rowGap: '1px', minWidth: 0, flexGrow: 1 },
  summaryKey: { color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightSemibold },
  thumbs: { display: 'flex', alignItems: 'flex-start', columnGap: '6px', flexWrap: 'wrap', rowGap: '6px', minHeight: '64px' },
  thumb: { display: 'grid', justifyItems: 'center', rowGap: '2px' },
  // 週の上限を超えた商品は、赤い枠と ⚠(色だけに頼らない)
  thumbOver: { outline: `1.5px solid ${tokens.colorPaletteRedBorder2}`, outlineOffset: '2px', borderRadius: tokens.borderRadiusSmall },
  thumbWarn: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', fontSize: '10px', color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  issues: { fontSize: '12px', padding: '4px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorPaletteYellowBackground1, color: tokens.colorPaletteDarkOrangeForeground1 },
  sameDay: { fontSize: '11px', color: tokens.colorNeutralForeground3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardActions: { display: 'flex', alignItems: 'center', columnGap: '6px', rowGap: '6px', flexWrap: 'wrap', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  waiting: { display: 'grid', rowGap: '6px', alignContent: 'center', minHeight: '120px' },
  footHint: { fontSize: '12px', color: tokens.colorNeutralForeground2, textAlign: 'right' },
  askSurface: { maxWidth: '520px', '& button': { whiteSpace: 'nowrap' } },
  foot: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '10px 20px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
})

interface Props {
  ws: BulkWorkspaceState
  /** すべての配信(取りやめを除く) */
  cards: DeliveryCard[]
  products: Product[]
  heroes: HeroImage[]
  /** 保存した配信を、配信カードで開く(focus は、選んでおく商品。週の上限超えを直すとき) */
  onOpen: (id: string, focus?: string) => void
  /** まだ保存していない案を、配信カードで開く(配信カードで保存したときに、はじめて保存される) */
  onOpenDraft: (day: string, focus?: string) => void
  /** 終えて、作った週の週表示に移る */
  onFinish: (weekStart: Date) => void
}

/**
 * まとめて作る作業画面(W14。2026-10-19 に、利用者のメモをもとに 2 つの手順に組み直した)。
 * ① 計画する(週・チャネル、作る日と、その日の種類・配信名。国はヘッダーで選んだ国)
 * → ② 作って決める(AI で作った案をカードで並べ、1 本ずつ「開いて編集」「保存」「破棄」)。
 * 中身を見る・直す場所は配信カードにまとめる(作業画面に、配信カードと同じ情報を並べない)。
 * ① のあと、中身を作らずに保存することもできる(1 本ずつ新規作成して、中身を入れずに保存したのと同じ)
 */
export function BulkWorkspace({ ws, cards, products, heroes, onOpen, onOpenDraft, onFinish }: Props) {
  const s = useStyles()
  const panes = usePaneWidths(PREF.bulkPaneWidths, [0, 280], 0, { min: 220, max: 600 })
  const t = useT()
  // 「終えて、週の表示で見る」から閉じようとしたか(閉じるダイアログで決めたあとも、週の表示に移るため)
  const finishRef = useRef(false)
  const dayText = (key: string) =>
    new Date(`${dayOfKey(key)}T00:00`).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' }) + (timeOfKey(key) ? ` ${timeOfKey(key)}` : '')
  const f = (d: Date) => d.toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })
  const weekEnd = new Date(ws.weekStart.getFullYear(), ws.weekStart.getMonth(), ws.weekStart.getDate() + 6)
  const weekText = `${f(ws.weekStart)} – ${f(weekEnd)}`
  const optionText = (opts: { value: string; label: string }[], v: string) => optionLabel(opts.find((o) => String(o.value) === v)?.label)
  const channelName = optionText(channelOptions, ws.channel)
  const n = ws.targets.length
  const readyCount = ws.targets.filter(ws.ready).length
  // 中身を作らずに保存したときは、② は通らない
  const plainDone = ws.plainCards.length > 0 || ws.savingPlain
  const pOf = (id: string) => products.find((p) => p.id === id)

  // ---- 見出し: 週・国・チャネル。国はヘッダーで選んだ国(X33)。ヘッダーが「すべての国」のときだけ、ここで選ぶ
  const editable = ws.step === 1 && !ws.started
  const target = (
    <span className={s.target}>
      {editable ? (
        <span className={s.weekPick}>
          <Button appearance="subtle" size="small" icon={<ChevronLeftRegular />} aria-label={t('前の週', 'Previous week')} onClick={() => ws.moveWeek(-1)} />
          <span className={s.weekText}>{weekText}</span>
          <Button appearance="subtle" size="small" icon={<ChevronRightRegular />} aria-label={t('次の週', 'Next week')} onClick={() => ws.moveWeek(1)} />
        </span>
      ) : (
        <span className={s.weekText}>{weekText}</span>
      )}
      {/* 選べないとき(ヘッダーで決めた国・② に進んだあと)は、週と同じく文字で出す(灰色の選択欄だと、押せそうに見えるため) */}
      {ws.countryFixed || !editable ? (
        <span className={s.country} title={ws.countryFixed ? t('国は、画面の上のヘッダーで選んだ国です', 'Country comes from the header') : undefined}>
          {optionText(countryOptions, ws.country)}
        </span>
      ) : (
        <Select size="small" className={s.countryPick} value={ws.country} aria-label={t('国', 'Country')} onChange={(_, v) => ws.setCountry(v.value)}>
          <option value="">{t('国を選んでください', 'Choose a country')}</option>
          {countryOptions.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {optionLabel(o.label)}
            </option>
          ))}
        </Select>
      )}
      {/* チャネルは ① の「作るチャネル」で選ぶ。選んだあとは、ここに印だけ出す(どのチャネルを作っているかが分かるように) */}
      {!editable && <ChannelBadge channel={ws.channel} size="small" />}
    </span>
  )
  // 作るチャネル: 空いている日(そのチャネルの配信がまだない日)の判定が変わるので、① の表のすぐ上で選ぶ
  // (以前は見出しの週・国の横のタブで、何を切り替えるものか分かりにくかった。2026-10-22 利用者の指摘)
  const channelPick = (
    <div className={s.channelRow} role="radiogroup" aria-label={t('作るチャネル', 'Channel to create')}>
      <span className={s.label}>{t('作るチャネル', 'Channel to create')}</span>
      {channelOptions.map((o) => {
        const on = ws.channel === String(o.value)
        return (
          <Button key={o.value} size="small" appearance={on ? 'primary' : 'outline'} role="radio" aria-checked={on} disabled={!editable} onClick={() => ws.setChannel(String(o.value))}>
            {optionLabel(o.label)}
          </Button>
        )
      })}
    </div>
  )

  // ---- 手順(2 つ)
  const stepNames: Record<Step, string> = {
    1: t('計画する', 'Plan'),
    2: t('作って決める', 'Create & decide'),
  }
  const stepDone = (k: Step) => (k === 1 && (ws.started || plainDone)) || (k === 2 && ws.reviewItems.length > 0 && ws.unsavedCount === 0 && ws.pending.length === 0 && !ws.running)
  const stepper = (
    <nav className={s.steps} aria-label={t('手順', 'Steps')}>
      {([1, 2] as Step[]).map((k) => (
        <Fragment key={k}>
          {k > 1 && <span className={s.stepLine} />}
          <Button
            appearance="transparent"
            size="small"
            className={mergeClasses(s.stepBtn, k === ws.step && !plainDone && s.stepNow, stepDone(k) && k !== ws.step && s.stepDone)}
            disabled={k === ws.step || (k === 1 ? ws.started || plainDone : !ws.started)}
            aria-current={k === ws.step ? 'step' : undefined}
            onClick={() => ws.setStep(k)}
            icon={stepDone(k) && k !== ws.step ? <CheckmarkCircleFilled className={s.doneIcon} /> : <span className={mergeClasses(s.stepNum, k === ws.step && s.stepNumNow)}>{k}</span>}
          >
            {stepNames[k]}
            {k === 1 && n > 0 && !ws.started && !plainDone ? ` (${readyCount}/${n})` : ''}
            {k === 2 && plainDone ? ` — ${t('作らずに保存', 'skipped')}` : k === 2 && ws.started ? ` (${t('保存', 'saved')} ${ws.savedCount}/${n})` : ''}
          </Button>
        </Fragment>
      ))}
    </nav>
  )

  // ---- ① 右: その週の配信(見るだけ。作ろうとしている行も、破線で重ねて見せる)
  const weekEndNext = new Date(ws.weekStart.getFullYear(), ws.weekStart.getMonth(), ws.weekStart.getDate() + 7)
  // 選んだ国の配信だけ(ほかの国の配信が、国の印なしに混ざると、重なりを見誤るため)
  const inWeek = cards.filter((c) => ws.inCountry(c) && c.scheduled_at && new Date(c.scheduled_at) >= ws.weekStart && new Date(c.scheduled_at) < weekEndNext)
  const madeIds = new Set([...ws.savedIds.values(), ...ws.plainCards.map((c) => c.id)])
  const side = (
    <aside className={s.side} aria-label={t('この週の配信', 'Deliveries this week')}>
      <h3 className={s.h3}>{t('この週の配信', 'This week')}</h3>
      {ws.days.map((d) => {
        const list = inWeek.filter((c) => dayKeyOf(new Date(c.scheduled_at!)) === d.key).sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
        // 作る予定の行(型の行なら、その日の型の数だけ)。保存した行・破棄した案は出さない
        // (以前は、その日に作った配信が 1 本でもあると、同じ日のほかの型の行も消えていた)
        const planned = ws.targets.filter(
          (k) => dayOfKey(k) === d.key && !ws.savedIds.has(k) && !(plainDone && list.some((c) => madeIds.has(c.id))) && ws.reviewItems.find((x) => x.day === k)?.state !== 'discarded',
        )
        return (
          <div key={d.key} className={s.sideDay}>
            <span className={s.label}>{dayText(d.key)}</span>
            {list.length === 0 && planned.length === 0 && <span className={s.muted}>—</span>}
            {list.map((c) => (
              <span key={c.id} className={mergeClasses(s.sideItem, !madeIds.has(c.id) && s.sideOld)}>
                <ChannelBadge channel={c.channel} size="small" />
                <span className={s.sideName}>{c.name || t('(配信名なし)', '(no name)')}</span>
                {madeIds.has(c.id) && (
                  <Badge size="small" appearance="tint" color="brand" className={s.newBadge}>
                    {t('いま作った', 'New')}
                  </Badge>
                )}
              </span>
            ))}
            {planned.map((k) => (
              <span key={k} className={s.sidePlanned}>
                <span className={s.sideItem}>
                  <Badge size="small" appearance="filled" color="brand" className={s.newBadge}>
                    {ws.started && ws.results.has(k) ? t('未保存の案', 'Unsaved draft') : t('作る予定', 'Planned')}
                  </Badge>
                  <ChannelBadge channel={ws.channel} size="small" />
                  {timeOfKey(k) && <span className={s.muted}>{timeOfKey(k)}</span>}
                  <span className={s.sideName}>{ws.rowOf(k).name || t('(配信名はまだ)', '(no name yet)')}</span>
                </span>
                {ws.rowOf(k).themeType && <span className={s.muted}>{themeTypeLabel(ws.rowOf(k).themeType as ThemeType)}</span>}
              </span>
            ))}
          </div>
        )
      })}
    </aside>
  )

  // ---- ① 計画する(作る日と、その日の種類・配信名を、1 つの表で)
  const step1 = () => {
    const locked = ws.lines.some((d) => d.state === 'locked')
    // AI でまとめて入れる行(種類か配信名が空)
    const unfilled = ws.targets.filter((d) => !ws.rowOf(d).name.trim() || !ws.rowOf(d).themeType)
    const note = (d: (typeof ws.lines)[number]): string => {
      if (d.state === 'locked') return t('確定した週', 'Confirmed week')
      if (d.state === 'past') return t('過ぎた日', 'Past')
      if (d.state === 'nopattern') return t('この曜日の型はありません', 'No pattern on this day')
      return t(`${channelName}あり: ${d.same.map((x) => x.name || '(配信名なし)').join('、')}`, `Has ${channelName}: ${d.same.map((x) => x.name || '(no name)').join(', ')}`)
    }
    return (
      <div className={s.main}>
        <section className={s.panel}>
          {/* 作り方の説明は、見出しの横の ⓘ に(X72。慣れると邪魔なので、見出しの下に並べない) */}
          <InfoLabel
            label={{ className: s.h3 }}
            info={
              ws.byPattern
                ? t(
                    `この国の配信の型どおりに、${channelName}の枠を作ります。種類は型の既定値で、行ごとに変えられます。テンプレートは型の既定値です(型で決めていなければ、中身を作るときに AI が選びます)。同じ時刻の${channelName}がもうある型は作りません。作る行にチェックを入れてください。ここではまだ保存しません。型は ⚙ →「国」→「配信の型」。`,
                    `Slots for ${channelName} from this country’s delivery patterns. The type is the pattern’s default and can be changed per row. The template is the pattern’s default (if the pattern has none, AI picks one when creating the content). Patterns that already have a ${channelName} at the same time are skipped. Check the rows to create. Nothing is saved yet. Edit patterns in ⚙ → Country → Delivery patterns.`,
                  )
                : t(
                    `${channelName}がまだない日(今日以降)に、1 日 1 本ずつ作ります。作る日にチェックを入れてください。種類と配信名は、AI に入れてもらい、あとで直せます。テンプレートは、中身を作るときに AI が選びます。ここではまだ保存しません。`,
                    `One delivery per day on days without ${channelName} (from today). Check the days. Let AI fill the type and name, then adjust. AI picks the template when creating the content. Nothing is saved yet.`,
                  )
            }
          >
            {t('作る日と、配信の方向', 'Days and direction')}
          </InfoLabel>
          {channelPick}
          {/* 作れないわけだけは、その場に出す(何もできない状態なので) */}
          {(!ws.country || locked) && (
            <span className={s.hint}>
              {!ws.country
                ? t('国を選んでください(画面の上のヘッダーが「すべての国」のため)。', 'Choose a country (the header is set to all countries).')
                : t('この週は確定しています。‹ › で、別の週を選んでください。', 'This week is confirmed. Use ‹ › to pick another week.')}
            </span>
          )}
          {/* AI でまとめて入れる。表の上に、何をするかが分かる帯で出す(小さなボタンだけだと、何が起きるか分からないため。詳しくは ⓘ) */}
          <div className={s.aiBar}>
            <AiIcon size={20} />
            <div className={s.aiText}>
              <InfoLabel
                label={{ className: s.aiTitle }}
                info={t(
                  '作る日のうち、種類か配信名が空の行に、日付・前後の配信に合う案を入れます。人が選んだ種類・入れた配信名は変えません。',
                  'Fills empty types and names with ideas that fit the date and nearby deliveries. What you entered stays as it is.',
                )}
              >
                {t('種類と配信名を AI でまとめて入れる', 'Fill types and names with AI')}
              </InfoLabel>
            </div>
            <Button appearance="primary" icon={ws.naming.size > 0 ? <Spinner size="extra-tiny" /> : <AiIcon tone="white" />} disabled={unfilled.length === 0 || ws.naming.size > 0} onClick={() => void ws.suggest(unfilled, true)}>
              {unfilled.length > 0 ? t(`空いている ${unfilled.length} 行に入れる`, `Fill ${unfilled.length} rows`) : t('空いている行はありません', 'Nothing to fill')}
            </Button>
          </div>
          <div className={s.table} role="table">
            <div className={s.thead} role="row">
              <span />
              <span className={s.label}>{t('配信日', 'Date')}</span>
              <span className={s.label}>{t('種類', 'Type')}</span>
              {/* 配信名が何かは ⓘ に(メールに出る文と間違えないように) */}
              <InfoLabel label={{ className: s.label }} info={t('社内で配信を見分けるための名前です(メールには出ません)', 'An internal label to tell deliveries apart (not shown in the email)')}>
                {t('配信名', 'Delivery name')}
              </InfoLabel>
            </div>
            {ws.lines.map((d) => {
              const free = d.state === 'free'
              const on = free && ws.chosen.has(d.key)
              const r = ws.rowOf(d.key)
              const busy = ws.naming.has(d.key)
              return (
                <div key={d.key} className={mergeClasses(s.tr, !free && s.dayOff, on && s.dayOn)} role="row">
                  {free ? <Checkbox checked={on} onChange={(_, v) => ws.toggleDay(d.key, !!v.checked)} aria-label={t(`${dayText(d.key)} に作る`, `Create on ${dayText(d.key)}`)} /> : d.state === 'locked' ? <LockClosedRegular /> : <span />}
                  <span className={s.dayDate}>
                    {dayText(d.key)}
                    {/* 型の行: 型の名前(なければテンプレート)を添える。種類・テンプレートは型の既定値 */}
                    {d.pattern && (
                      <Badge size="small" appearance="tint" color="informative" className={s.newBadge} title={t('配信の型(⚙ →「国」→「配信の型」)で決めた枠です', 'A slot from the delivery patterns (⚙ → Country → Delivery patterns)')}>
                        {d.pattern.name || (d.pattern.layout_key ? getTemplate(d.pattern.layout_key).label : t('型', 'Pattern'))}
                      </Badge>
                    )}
                  </span>
                  {!free ? (
                    <span className={mergeClasses(s.dayNote, s.span2)}>{note(d)}</span>
                  ) : !on ? (
                    <span className={mergeClasses(s.dayNote, s.span2, s.muted)}>{t('作らない', 'Skip')}</span>
                  ) : (
                    <>
                      {/* 種類はプルダウン(AI が埋めて、人が直す。チップだと毎回 9 種類が並び、情報が多すぎるため) */}
                      <Select size="small" value={r.themeType} onChange={(_, v) => ws.setRow(d.key, { themeType: v.value, typeByAi: false })} aria-label={t('種類', 'Type')}>
                        <option value="">{t('(AI が入れます)', '(AI will fill)')}</option>
                        {THEME_TYPES.map((k) => (
                          <option key={k} value={k}>
                            {themeTypeLabel(k)}
                          </option>
                        ))}
                      </Select>
                      <div className={s.nameCell}>
                        <div className={s.nameLine}>
                          <Input size="small" className={s.grow} value={r.name} placeholder={t('(AI が入れます)', '(AI will fill)')} onChange={(_, v) => ws.setRow(d.key, { name: v.value, nameReason: undefined })} aria-label={t('配信名', 'Delivery name')} />
                          <Button size="small" appearance="subtle" icon={busy ? <Spinner size="extra-tiny" /> : <AiIcon />} disabled={busy} title={t('この行に配信名の案', 'Suggest a name for this row')} aria-label={t('この行に配信名の案', 'Suggest a name for this row')} onClick={() => void ws.suggest([d.key])} />
                        </div>
                        {(r.nameReason || r.typeByAi) && (
                          <span className={s.reason}>
                            {[r.typeByAi && r.themeType ? t('種類は AI の案', 'Type by AI') : '', r.nameReason ? `${t('案の理由', 'Why')}: ${r.nameReason}` : ''].filter(Boolean).join(' ・ ')}
                          </span>
                        )}
                      </div>
                    </>
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

  // ---- ② 作って決める: 作る日ごとのカード。AI ができたものから中身が入る
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
  const step2 = () => {
    const failedDays = ws.targets.filter((d) => ws.failed.has(d))
    return (
      <div className={s.step2}>
        <div className={s.tools}>
          {/* 作っている間は、いまの様子をその場に。決め方の説明は ⓘ に(X72) */}
          {ws.running ? (
            <span className={s.hint}>{t('AI が中身を作っています(同時に 3 本まで)。できた案から、カードに中身が入ります。', 'AI is creating the content (up to 3 at a time). Cards fill in as they finish.')}</span>
          ) : (
            <InfoLabel
              label={{ className: s.h3 }}
              info={t(
                '保存するまでは、案はこの画面の中だけにあります。中身を見る・直すときは「開いて編集」(配信カードで開きます)。そのままでよければ「保存」、いらなければ「破棄」、別の案がよければ「作り直す」(前の案は消えます)。保存した案は、下書き(未起案)になります。',
                'Drafts live only in this window until saved. Use “Open & edit” to review or fix in the card, “Save” to keep as is, “Discard” to drop, or “Recreate” for another draft (the current one is replaced). Saved drafts become regular drafts (Not started).',
              )}
            >
              {t('できた案', 'Drafts')}
            </InfoLabel>
          )}
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
        <div className={s.cards}>
          {ws.targets.map((day) => {
            const row = ws.rowOf(day)
            const item = ws.reviewItems.find((x) => x.day === day)
            const prog = ws.progress.get(day)
            const fail = ws.failed.get(day)
            // 同じ日の、ほかの配信(週の中の手がかり。週の表示をもう 1 つ作らずに、まわりの様子が分かるように)
            const sameDay = inWeek.filter((c) => !madeIds.has(c.id) && dayKeyOf(new Date(c.scheduled_at!)) === day)
            const head = (
              <div className={s.cardHead}>
                <ChannelBadge channel={ws.channel} size="small" />
                <span>{dayText(day)}</span>
                {(item?.card.theme_type || row.themeType) && <span>{`・ ${themeTypeLabel((item?.card.theme_type || row.themeType) as ThemeType)}`}</span>}
                <span className={s.spacer} />
                {item && stateBadge(item.state)}
              </div>
            )
            const sameDayLine = sameDay.length > 0 && (
              <span className={s.sameDay}>{t(`同じ日の配信: ${sameDay.map((c) => c.name).join('、')}`, `Same day: ${sameDay.map((c) => c.name).join(', ')}`)}</span>
            )
            if (!item) {
              // まだできていない(作っている途中・順番待ち・失敗)
              return (
                <div key={day} className={s.card}>
                  {head}
                  <h4 className={s.cardTitle}>{row.name}</h4>
                  <div className={s.waiting}>
                    {prog ? (
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
                      <span className={s.muted}>{t('まだ作っていません', 'Not created yet')}</span>
                    )}
                  </div>
                  <span />
                  {sameDayLine || <span />}
                </div>
              )
            }
            const c = item.card
            const is = ws.issuesOf(item)
            const issueText = [
              is.over.length > 0 && t(`週の上限を超える商品 ${is.over.length} 点`, `${is.over.length} item(s) over the weekly limit`),
              is.sameTheme.length > 0 && t(`同じテーマ ${is.sameTheme.length} 本`, `Same theme ×${is.sameTheme.length}`),
              is.sameHero.length > 0 && t(`同じメイン画像 ${is.sameHero.length} 本`, `Same hero ×${is.sameHero.length}`),
            ].filter(Boolean)
            const busy = ws.savingDay === day
            // 直すことがあれば、主のボタンを「開いて直す」にして、上限を超えた商品を選んだ状態で開く
            const fixFocus = is.over[0]
            const open = () => (item.state === 'saved' ? onOpen(c.id, fixFocus) : onOpenDraft(day, fixFocus))
            // この 1 本だけ、別の案に作り直す(まだ保存していない案・破棄した案だけ。ほかを作っている間は待つ)。
            // 未保存のカードはボタンが 4 つ並ぶので、破棄・作り直すは印だけにし、名前は Tooltip で出す(カードの幅で折り返さないように)
            const regenLabel = ws.running ? t('作り直す(ほかの案を作り終えてから使えます)', 'Recreate (after the other drafts finish)') : t('作り直す(前の案は消えます)', 'Recreate (replaces this draft)')
            const regen = (compact: boolean) =>
              compact ? (
                <Tooltip content={regenLabel} relationship="label">
                  <Button size="small" appearance="subtle" icon={<AiIcon />} disabled={busy || ws.running} onClick={() => void ws.regenerate(day)} />
                </Tooltip>
              ) : (
                <Button size="small" appearance="subtle" icon={<AiIcon />} disabled={busy || ws.running} title={regenLabel} onClick={() => void ws.regenerate(day)}>
                  {t('作り直す', 'Recreate')}
                </Button>
              )
            return (
              <div key={day} className={mergeClasses(s.card, item.state === 'saved' && s.cardSaved, item.state === 'discarded' && s.cardOff)}>
                {head}
                <h4 className={s.cardTitle} title={c.name}>
                  {c.name}
                </h4>
                {/* 開かなくても決められるように、メイン画像・ヘッドライン(プッシュはタイトル)・テンプレートも出す */}
                <div className={s.cardSummary}>
                  {c.channel !== CHANNEL_PUSH && (
                    <ImageThumb src={heroImage(heroes.find((h) => h.id === c.hero_image_id))} alt={t('メイン画像', 'Hero image')} width={72} height={48} />
                  )}
                  <div className={s.summaryText}>
                    {[
                      [t('テーマ', 'Theme'), c.theme],
                      c.channel === CHANNEL_PUSH ? [t('タイトル', 'Title'), c.push_title] : [t('ヘッドライン', 'Headline'), c.headline],
                      [t('テンプレート', 'Template'), c.layout_key ? getTemplate(c.layout_key).label : ''],
                    ].map(([k, v]) => (
                      <span key={k} className={s.theme} title={v ?? ''}>
                        <span className={s.summaryKey}>{k}</span> {v || '—'}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className={s.thumbs}>
                    {item.productIds.map((pid, i) => {
                      const over = is.over.includes(pid)
                      return (
                        <span key={`${pid}-${i}`} className={s.thumb} title={pOf(pid)?.name ?? ''}>
                          <span className={mergeClasses(over && s.thumbOver)}>
                            <ImageThumb src={productImage(pOf(pid))} alt={pOf(pid)?.name ?? ''} width={40} height={52} />
                          </span>
                          {over && (
                            <span className={s.thumbWarn}>
                              <WarningFilled />
                              {t(`今週 ${ws.weekUse.get(pid) ?? 0}`, `${ws.weekUse.get(pid) ?? 0}/wk`)}
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                  {item.state !== 'discarded' && issueText.length > 0 && (
                    // 名前は、数だけにして、指したときに出す(カードが長くならないように)
                    <div className={s.issues} title={[...is.sameTheme.map((x) => t(`同じテーマ: ${x}`, `Same theme: ${x}`)), ...is.sameHero.map((x) => t(`同じメイン画像: ${x}`, `Same hero: ${x}`))].join(' / ')}>
                      <WarningFilled /> {issueText.join(' ・ ')}
                    </div>
                  )}
                  {sameDayLine}
                </div>
                <div className={s.cardActions}>
                  {item.state === 'discarded' ? (
                    <>
                      <Button size="small" onClick={() => ws.undoDiscard(day)}>
                        {t('破棄を取り消す', 'Undo discard')}
                      </Button>
                      <span className={s.spacer} />
                      {regen(false)}
                    </>
                  ) : (
                    <>
                      {/* 保存したあとは、保存した配信を消すので「削除」。まだ保存していない案は、画面から外すだけなので「破棄」(印の決まり: 削除だけ Delete) */}
                      {item.state === 'saved' ? (
                        <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={busy} onClick={() => void ws.discard(day)}>
                          {t('削除', 'Delete')}
                        </Button>
                      ) : (
                        <Tooltip content={t('破棄(この案は保存しません)', 'Discard (don’t save this draft)')} relationship="label">
                          <Button size="small" appearance="subtle" icon={<DismissRegular />} disabled={busy} onClick={() => void ws.discard(day)} />
                        </Tooltip>
                      )}
                      {item.state === 'unsaved' && regen(true)}
                      <span className={s.spacer} />
                      {item.state === 'unsaved' && (
                        <Button size="small" icon={busy ? <Spinner size="extra-tiny" /> : <SaveRegular />} disabled={busy} onClick={() => void ws.save(day)}>
                          {t('保存', 'Save')}
                        </Button>
                      )}
                      <Button size="small" appearance={item.state === 'unsaved' ? 'primary' : 'secondary'} icon={fixFocus ? <WarningFilled /> : <EditRegular />} disabled={busy} onClick={open}>
                        {fixFocus ? t('開いて直す', 'Open & fix') : t('開いて編集', 'Open & edit')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- 下: 手順に合わせたボタン。② では、全体に効くボタンだけ(1 本ずつのボタンは、カードの中)
  const finish = () => {
    finishRef.current = true
    void ws.close().then((closed) => closed && onFinish(ws.weekStart))
  }
  const afterAsk = () => {
    ws.setCloseAsk(false)
    ws.closeNow()
    if (finishRef.current) onFinish(ws.weekStart)
  }
  const finishButton = (
    <Button appearance="primary" icon={<CalendarLtrRegular />} disabled={ws.savingPlain || !!ws.savingDay || ws.running} onClick={finish}>
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
                disabled={!ws.country || (!ws.allReady && !ws.plainReady)}
                primaryActionButton={{ disabled: !ws.country || !ws.allReady, onClick: () => void ws.generate(ws.pending) }}
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
                onClick={async () => {
                  if (await confirmDialog(t(`中身は作らずに、${n} 本を下書き(未起案)で保存します。中身は、あとで配信カードで作ります。よろしいですか?`, `Save ${n} as drafts (Not started) without content? You can create the content later in each card.`))) void ws.savePlainAll()
                }}
              >
                {t(`中身は作らずに、${n} 本を下書きで保存`, `Save ${n} as drafts without content`)}
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      )
    return (
      <>
        {ws.unsavedCount > 0 && (
          <Button
            icon={ws.savingDay ? <Spinner size="tiny" /> : <SaveRegular />}
            disabled={!!ws.savingDay || ws.running}
            onClick={async () => {
              if (await confirmDialog(t(`まだ決めていない ${ws.unsavedCount} 本を、まとめて下書き(未起案)で保存します。よろしいですか?`, `Save all ${ws.unsavedCount} remaining drafts (Not started)?`))) void ws.saveAll()
            }}
          >
            {t(`残りの ${ws.unsavedCount} 本をまとめて保存`, `Save all ${ws.unsavedCount} remaining`)}
          </Button>
        )}
        {finishButton}
      </>
    )
  }
  // ボタンのすぐ左に置く、短い状態の説明(説明とボタンを 1 か所にまとめ、目が左下から右下へ横断しないように)
  const footHint = plainDone
    ? ''
    : ws.step === 1
      ? readyCount === n && n > 0
        ? t(`${n} 本そろいました`, `All ${n} ready`)
        : t(`種類と配信名: ${readyCount} / ${n} 本`, `Type & name: ${readyCount} / ${n}`)
      : ws.unsavedCount === 0 && !ws.running && ws.pending.length === 0
        ? t(`保存 ${ws.savedCount} / ${n} 本。すべて決めました`, `Saved ${ws.savedCount} of ${n}. All decided`)
        : t(`保存 ${ws.savedCount} / ${n} 本`, `Saved ${ws.savedCount} of ${n}`)

  return (
    <>
      <Dialog open={ws.open} modalType="modal" onOpenChange={(_, d) => !d.open && void ws.close()}>
        <ResizableSurface sizeKey="bulk" className={s.surface} aria-label={t('まとめて作る', 'Create in bulk')}>
          <div className={s.head}>
            <AiIcon size={20} />
            <h2 className={s.title}>{t('まとめて作る', 'Create in bulk')}</h2>
            {target}
            <span className={s.spacer} />
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              disabled={ws.running || ws.savingPlain}
              aria-label={t('閉じる', 'Close')}
              onClick={() => {
                finishRef.current = false
                void ws.close()
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
            {plainDone ? (
              <div className={s.withSide} style={{ '--cols': panes.columns } as CSSProperties}>
                {plainView()}
                <Splitter onDrag={panes.onDrag(0)} onDone={panes.onDone} />
                {side}
              </div>
            ) : ws.step === 1 ? (
              <div className={s.withSide} style={{ '--cols': panes.columns } as CSSProperties}>
                {step1()}
                <Splitter onDrag={panes.onDrag(0)} onDone={panes.onDone} />
                {side}
              </div>
            ) : (
              // ② でも、週の様子を右に出す(重なりを見ながら、保存・破棄を決められるように。幅は ① と同じ)
              <div className={s.withSide} style={{ '--cols': panes.columns } as CSSProperties}>
                {step2()}
                <Splitter onDrag={panes.onDrag(0)} onDone={panes.onDone} />
                {side}
              </div>
            )}
          </div>
          <div className={s.foot}>
            <span className={s.spacer} />
            <span className={s.footHint}>{footHint}</span>
            {actions()}
          </div>
        </ResizableSurface>
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
              <Button appearance="secondary" icon={<DismissRegular />} disabled={!!ws.savingDay} onClick={afterAsk}>
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
