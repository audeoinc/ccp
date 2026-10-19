import { Fragment, useState, type ReactNode } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogSurface,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Radio,
  RadioGroup,
  Select,
  Spinner,
  Tab,
  ToggleButton,
  TabList,
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
  ChevronLeftRegular,
  ChevronRightRegular,
  DismissRegular,
  EditRegular,
  ErrorCircleRegular,
  LockClosedRegular,
} from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { locale, optionLabel, useT } from './i18n'
import { AiIcon } from './AiMark'
import { ChannelBadge } from './ChannelBadge'
import { CheckView, type CheckTab } from './CheckDrawer'
import { channelOptions, countryOptions } from './status'
import { THEME_TYPES, themeTypeLabel, type ThemeType } from './themeTypes'
import { dayKeyOf } from './weekLock'
import type { BulkWorkspaceState, Step } from './useBulkWorkspace'

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
  sideNew: { fontStyle: 'italic', color: tokens.colorBrandForeground1 },
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
  itemHead: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  tools: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  foot: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '10px 20px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
})

interface Props {
  ws: BulkWorkspaceState
  /** すべての配信(取りやめを除く) */
  cards: DeliveryCard[]
  cardProducts: Map<string, string[]>
  products: Product[]
  heroes: HeroImage[]
  /** 配信カードを開いて直す(作業画面の上に重なる) */
  onOpen: (id: string) => void
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
export function BulkWorkspace({ ws, cards, cardProducts, products, heroes, onOpen, onFinish }: Props) {
  const s = useStyles()
  const t = useT()
  const [tab, setTab] = useState<CheckTab>('content')
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
    3: t('確かめる', 'Review'),
  }
  // 中身を作らずに保存したときは、② ③ は通らない
  const plainDone = ws.plainCards.length > 0 || ws.savingPlain
  // 戻れるのは、済んだ手順だけ。何か保存したら、① には戻らない(保存した配信と、行の対応がずれるため)
  const reachable = (k: Step) => {
    if (ws.running || plainDone) return k === ws.step
    if (k === 1) return !ws.saved
    if (k === 2) return ws.made.size > 0 || ws.failed.size > 0
    return ws.madeCards.length > 0
  }
  const stepDone = (k: Step) => k < ws.step || (k === 1 && plainDone) || (k === 2 && ws.made.size > 0 && ws.pending.length === 0)
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
            {k === 2 && plainDone ? ` — ${t('作らずに保存', 'skipped')}` : k === 2 && n > 0 && ws.saved ? ` (${ws.made.size}/${n})` : ''}
            {k === 3 && ws.madeCards.length > 0 ? ` (${t('未確認', 'unchecked')} ${ws.unchecked})` : ''}
          </Button>
        </Fragment>
      ))}
    </nav>
  )

  // ---- 右: その週の配信(見るだけ。作ろうとしている行も、薄く重ねて見せる)
  const weekEndNext = new Date(ws.weekStart.getFullYear(), ws.weekStart.getMonth(), ws.weekStart.getDate() + 7)
  const inWeek = cards.filter((c) => c.scheduled_at && new Date(c.scheduled_at) >= ws.weekStart && new Date(c.scheduled_at) < weekEndNext)
  const madeIds = new Set([...ws.made.values(), ...ws.plainCards.map((c) => c.id)])
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
              <span key={c.id} className={s.sideItem}>
                <ChannelBadge channel={c.channel} size="small" />
                <span className={s.sideName}>{c.name || t('(配信名なし)', '(no name)')}</span>
                {/* すべての国を出すので、① の国と違う配信だと分かるように */}
                {c.country && <span className={s.muted}>{c.country}</span>}
                {madeIds.has(c.id) && <Badge size="small" appearance="tint" color="brand" className={s.newBadge}>{t('いま作った', 'New')}</Badge>}
              </span>
            ))}
            {planned && (
              <span className={mergeClasses(s.sideItem, s.sideNew)}>
                <ChannelBadge channel={ws.channel} size="small" />
                <span className={s.sideName}>{ws.rowOf(d.key).name || t('(作る予定)', '(to create)')}</span>
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
              `同時に 3 本まで作ります。できた配信から、1 本ずつ作った下書きと同じ「未起案」で保存し、「AI 下書き・未確認」の印を付けます(④ で確かめると外れます)。`,
              `Up to 3 at a time. Each finished delivery is saved as a regular draft (Not started) with an “AI draft, unchecked” mark (cleared when you review it in step 4).`,
            )}
          </span>
          <div className={s.grid3}>
            {ws.targets.map((d) => {
              const r = ws.rowOf(d)
              const prog = ws.progress.get(d)
              const fail = ws.failed.get(d)
              const done = ws.made.has(d)
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
                        {t('保存しました(未起案・AI 下書き・未確認)', 'Saved (Not started · AI draft, unchecked)')}
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

  // ---- ③ 確かめる
  const step3 = () => {
    const current = ws.madeCards.find((c) => c.id === ws.checkId) ?? ws.madeCards[0]
    if (!current) return <span className={s.muted}>{t('作った配信はまだありません。', 'Nothing created yet.')}</span>
    const nextUnchecked = () => ws.madeCards.find((c) => c.id !== current.id && c.ai_unchecked_at)
    return (
      <div className={s.check}>
        <div className={s.list} role="listbox" aria-label={t('作った配信', 'Created deliveries')}>
          {ws.madeCards.map((c) => (
            <button key={c.id} type="button" role="option" aria-selected={c.id === current.id} className={mergeClasses(s.item, c.id === current.id && s.itemOn)} onClick={() => ws.setCheckId(c.id)}>
              <span className={s.itemHead}>
                <ChannelBadge channel={c.channel} size="small" />
                <span className={s.name}>{c.name}</span>
              </span>
              <span className={s.itemHead}>
                <span className={s.muted}>{c.scheduled_at ? dayText(dayKeyOf(new Date(c.scheduled_at))) : ''}</span>
                <span className={s.spacer} />
                {c.ai_unchecked_at ? (
                  <Badge size="small" appearance="tint" color="warning">
                    {t('未確認', 'Unchecked')}
                  </Badge>
                ) : (
                  <Badge size="small" appearance="tint" color="success" icon={<CheckmarkRegular />}>
                    {t('確認した', 'Checked')}
                  </Badge>
                )}
              </span>
            </button>
          ))}
        </div>
        <section className={s.panel}>
          <div className={s.tools}>
            <h3 className={s.h3}>{current.name}</h3>
            <TabList size="small" selectedValue={tab} onTabSelect={(_, v) => setTab(v.value as CheckTab)}>
              <Tab value="content">{t('中身', 'Content')}</Tab>
              <Tab value="compare">{t('比べる', 'Compare')}</Tab>
            </TabList>
            <span className={s.spacer} />
            <Button size="small" icon={<EditRegular />} onClick={() => onOpen(current.id)}>
              {t('開いて直す', 'Open & edit')}
            </Button>
            {current.ai_unchecked_at && (
              <Button
                size="small"
                appearance="primary"
                icon={<CheckmarkRegular />}
                onClick={async () => {
                  const next = nextUnchecked()
                  await ws.check(current.id)
                  // 確かめたら、次の未確認に進む(1 本ずつ選び直さなくてよいように)
                  if (next) ws.setCheckId(next.id)
                }}
              >
                {t('確認した', 'Checked')}
              </Button>
            )}
          </div>
          <CheckView card={current} tab={tab} cards={cards} cardProducts={cardProducts} products={products} heroes={heroes} />
        </section>
      </div>
    )
  }

  // ---- 下: 戻る と、手順に合わせたボタン(① だけは、AI で作るか、作らずに保存するかの 2 つ)
  const finishButton = (
    <Button
      appearance="primary"
      icon={<CalendarLtrRegular />}
      disabled={ws.savingPlain}
      onClick={() => {
        ws.close()
        onFinish(ws.weekStart)
      }}
    >
      {t('終えて、週の表示で見る', 'Finish and open the week')}
    </Button>
  )
  const actions = (): ReactNode => {
    if (plainDone) return finishButton
    if (ws.step === 1)
      return (
        <>
          <Button appearance="secondary" disabled={!ws.plainReady} onClick={() => void ws.savePlainAll()}>
            {t(`中身は作らずに ${n} 本を保存`, `Save ${n} without content`)}
          </Button>
          <Button appearance="primary" icon={<AiIcon tone="white" />} disabled={!ws.allReady} onClick={() => void ws.generate(ws.pending)}>
            {t(`${n} 本の中身を AI で作る`, `Create ${n} with AI`)}
          </Button>
        </>
      )
    if (ws.step === 2)
      return (
        <Button appearance="primary" icon={<ArrowRightRegular />} iconPosition="after" disabled={ws.running || ws.madeCards.length === 0} onClick={() => ws.setStep(3)}>
          {t(`次へ: ${ws.madeCards.length} 本を確かめる`, `Next: review ${ws.madeCards.length}`)}
        </Button>
      )
    return finishButton
  }
  const back = !plainDone && ws.step === 3 ? 2 : null
  const footHint = plainDone
    ? ''
    : ws.step === 1
      ? t(
          `作る ${n} 本 ・ 種類と配信名が入った ${readyCount} 本(AI で作るには、両方が要ります。作らずに保存するときは、配信名だけで保存できます)`,
          `${n} to create · ${readyCount} with type and name (AI needs both; saving without content needs only names)`,
        )
      : ws.step === 3
        ? t(`未確認 ${ws.unchecked} 本。確かめないまま終えても、配信は下書きとして残り、週の表示に「AI 下書き・未確認」の印が出ます。`, `${ws.unchecked} unchecked. If you finish now, they stay as drafts with an “AI draft, unchecked” mark in the week view.`)
        : ''

  return (
    <Dialog open={ws.open} modalType="modal" onOpenChange={(_, d) => !d.open && ws.close()}>
      <DialogSurface className={s.surface} aria-label={t('まとめて作る', 'Create in bulk')}>
        <div className={s.head}>
          <AiIcon size={20} />
          <h2 className={s.title}>{t('まとめて作る', 'Create in bulk')}</h2>
          <span className={s.summary}>{`${weekText} ・ ${countryName} ・ ${channelName}`}</span>
          <span className={s.spacer} />
          <Button appearance="subtle" icon={<DismissRegular />} disabled={ws.running || ws.savingPlain} aria-label={t('閉じる', 'Close')} onClick={ws.close} />
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
          <span className={s.summary}>{footHint}</span>
          <span className={s.spacer} />
          {actions()}
        </div>
      </DialogSurface>
    </Dialog>
  )
}
