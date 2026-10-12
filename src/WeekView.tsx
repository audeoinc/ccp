import { useState } from 'react'
import { Popover, PopoverSurface, PopoverTrigger, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import {
  AddRegular,
  CalendarRegular,
  CheckmarkCircleFilled,
  CircleRegular,
  EyeRegular,
  MailRegular,
  PersonRegular,
  PhoneRegular,
  QuestionCircleFilled,
  TaskListLtrRegular,
  WarningFilled,
  WrenchRegular,
} from '@fluentui/react-icons'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import { heroImage, productImage } from './images'
import { locale, optionLabel, useT } from './i18n'
import { SOURCE_MANUAL, type Item } from './items'
import { Preview } from './Preview'
import { cardProgress } from './progress'
import { statusColor, statusOptions } from './status'
import { getTemplate, sectionRange, sectionsOf, templateFromValue } from './templates'

/** 週の表示の見方。products = 商品のバランスを見る / progress = 進み具合を見る */
export type WeekLens = 'products' | 'progress'

interface Props {
  /** 週の初め(日曜日) */
  start: Date
  cards: Cr854_deliverycards[]
  /** 配信カードごとの掲載商品(メールの並び順の商品 ID) */
  cardProducts: Map<string, string[]>
  /** 配信カードごとの、制作からの質問の未解決の数 */
  questionCounts: Map<string, number>
  /** 配信カードごとの、未完了のタスクの数 */
  taskCounts: Map<string, number>
  /** 配信カードごとの、期日を過ぎた未完了のタスクの数 */
  overdueTasks: Map<string, number>
  lens: WeekLens
  products: Cr854_products[]
  heroes: Cr854_heroimages[]
  dueSoon?: Set<string>
  onSelect: (id: string) => void
  /** その日付で新規作成する(値は YYYY-MM-DD) */
  onCreate: (day: string) => void
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const EMAIL = 588230000
const PUSH = 588230001
// 1 日の並び: メールを上、プッシュを下にそろえる(週を横に見比べやすく)。同じチャネルの中は時刻順
const rank = (c: Cr854_deliverycards) => (c.cr854_channel === EMAIL ? 0 : c.cr854_channel === PUSH ? 1 : 2)
const order = (a: Cr854_deliverycards, b: Cr854_deliverycards) => rank(a) - rank(b) || (a.cr854_scheduledat ?? '').localeCompare(b.cr854_scheduledat ?? '')
const label = (options: { value: number; label: string }[], v?: number) => optionLabel(options.find((o) => o.value === v)?.label)
const shortDate = (ymd?: string) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale(), { month: '2-digit', day: '2-digit' })
}
/** セクションのコピー(JSON の配列。古い形式の改行区切りも読む) */
const parseCopies = (v?: string): string[] => {
  if (!v) return []
  try {
    const a = JSON.parse(v)
    if (Array.isArray(a)) return a.map(String)
  } catch {
    // JSON でなければ、改行区切りとして読む
  }
  return v.split('\n')
}
const firstName = (name?: string) => (name ?? '').trim().split(/\s+/)[0] ?? ''

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
    overflow: 'hidden',
  },
  col: { display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: `1px solid ${tokens.colorNeutralStroke2}`, ':last-child': { borderRight: 'none' } },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  today: { color: tokens.colorBrandForeground1 },
  add: {
    width: '22px',
    height: '22px',
    display: 'grid',
    placeItems: 'center',
    border: 'none',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: 'transparent',
    color: tokens.colorBrandForeground1,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorBrandBackground2 },
  },
  // 1 日 2 本(メール 1 + プッシュ 1)が収まる高さ。3 本以上は、その日の列だけスクロールする
  body: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '8px',
    padding: '8px',
    height: 'max(520px, calc(100vh - 250px))',
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  card: {
    flexShrink: 0,
    display: 'grid',
    textAlign: 'left',
    padding: 0,
    overflow: 'hidden',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    fontFamily: 'inherit',
    cursor: 'pointer',
    minWidth: 0,
    ':hover': { boxShadow: tokens.shadow4 },
  },
  // チャネルの帯(メールとアプリを、色とアイコンで見分ける)
  strip: { display: 'flex', alignItems: 'center', columnGap: '4px', padding: '3px 8px', fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold },
  stripEmail: { backgroundColor: tokens.colorPaletteBlueBackground2, color: tokens.colorPaletteBlueForeground2 },
  stripPush: { backgroundColor: tokens.colorPaletteBerryBackground2, color: tokens.colorPaletteBerryForeground2 },
  stripNone: { backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground3 },
  stripTime: { marginLeft: 'auto', fontWeight: tokens.fontWeightRegular },
  inner: { display: 'grid', rowGap: '5px', padding: '6px 8px 8px', minWidth: 0 },
  nameRow: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  dot: { width: '8px', height: '8px', borderRadius: tokens.borderRadiusCircular, flexShrink: 0 },
  name: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // 問題があるときだけ出す印(締め切りが近いのに未着手・期日を過ぎたタスク・未解決の質問)
  issues: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  issue: { display: 'inline-flex', alignItems: 'center', columnGap: '3px', padding: '1px 6px', borderRadius: tokens.borderRadiusCircular, fontSize: '10px', fontWeight: tokens.fontWeightSemibold, lineHeight: '16px', whiteSpace: 'nowrap' },
  issueWarn: { backgroundColor: tokens.colorPaletteDarkOrangeBackground1, color: tokens.colorPaletteDarkOrangeForeground1 },
  issueBad: { backgroundColor: tokens.colorPaletteRedBackground1, color: tokens.colorPaletteRedForeground1 },
  // 進み具合: 工程の棒
  progressRow: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  bar: { flexGrow: 1, height: '4px', borderRadius: '2px', backgroundColor: tokens.colorNeutralBackground5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '2px' },
  text: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  textStrong: { color: tokens.colorNeutralForeground1, fontWeight: tokens.fontWeightSemibold },
  // 進み具合: アイコンと短い値の並び
  facts: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '6px', rowGap: '2px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground2 },
  fact: { display: 'inline-flex', alignItems: 'center', columnGap: '3px', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', '& svg': { flexShrink: 0, color: tokens.colorNeutralForeground3 } },
  faint: { color: tokens.colorNeutralForeground4, '& svg': { color: tokens.colorNeutralForeground4 } },
  good: { color: tokens.colorPaletteGreenForeground1, '& svg': { color: tokens.colorPaletteGreenForeground1 } },
  // 商品: メイン画像と、掲載商品の全点(セクションごと)。画像は切らずに全体を見せる
  hero: { width: '100%', aspectRatio: '16 / 9', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3, overflow: 'hidden' },
  img: { display: 'block', width: '100%', height: '100%', objectFit: 'contain' },
  secLabel: { fontSize: '10px', color: tokens.colorNeutralForeground3 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '3px' },
  thumb: {
    aspectRatio: '3 / 4',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: 'hidden',
    outline: '2px solid transparent',
    outlineOffset: '-2px',
  },
  // マウスを重ねた商品と同じ商品(この週の他の配信にあるもの)を、枠で光らせる
  thumbHit: { outlineColor: tokens.colorBrandStroke1 },
  thumbDim: { opacity: 0.35 },
  push: {
    display: 'grid',
    rowGap: '2px',
    padding: '6px 8px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    color: tokens.colorNeutralForeground2,
    minWidth: 0,
  },
  pushTitle: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pushBody: { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  empty: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, fontStyle: 'italic' },
  peek: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', justifySelf: 'end', fontSize: tokens.fontSizeBase100, color: tokens.colorBrandForeground1, cursor: 'zoom-in' },
  // マウスを重ねたときに出す、実際のメールの見た目
  previewBox: { width: '360px', maxHeight: 'min(80vh, 900px)', overflowY: 'auto', backgroundColor: '#ffffff' },
  previewInner: { zoom: 0.6 },
})

const noop = () => undefined

/**
 * 1 週間の配信を横に並べる。見方(lens)を切り替えて、目的に合う情報だけを出す。
 * - 商品: メイン画像と掲載商品の全点(かぶり・バランスを見る)
 * - 進み具合: ステータス・工程・担当・締め切り・引き継ぎ・タスク
 * どちらの見方でも、問題(締め切りが近いのに未着手・期日を過ぎたタスク・未解決の質問)は、色の印で出す。
 */
export function WeekView({ start, cards, cardProducts, questionCounts, taskCounts, overdueTasks, lens, products, heroes, dueSoon, onSelect, onCreate }: Props) {
  const styles = useStyles()
  const t = useT()
  const [hover, setHover] = useState<string | null>(null)
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const today = dayKey(new Date())
  const byDay = new Map<string, Cr854_deliverycards[]>()
  for (const c of cards) {
    if (!c.cr854_scheduledat) continue
    const k = dayKey(new Date(c.cr854_scheduledat))
    byDay.set(k, [...(byDay.get(k) ?? []), c])
  }
  for (const list of byDay.values()) list.sort(order)
  const productOf = (id: string) => products.find((p) => p.cr854_productid === id)

  const thumbs = (ids: string[]) => (
    <div className={styles.grid}>
      {ids.map((id, i) => {
        const p = productOf(id)
        const src = productImage(p)
        return (
          <div
            key={`${id}-${i}`}
            className={mergeClasses(styles.thumb, hover === id && styles.thumbHit, !!hover && hover !== id && styles.thumbDim)}
            title={p?.cr854_name}
            onMouseEnter={() => setHover(id)}
            onMouseLeave={() => setHover(null)}
          >
            {src && <img className={styles.img} src={src} alt={p?.cr854_name ?? ''} draggable={false} />}
          </div>
        )
      })}
    </div>
  )

  const card = (c: Cr854_deliverycards) => {
    const id = c.cr854_deliverycardid
    const ids = cardProducts.get(id) ?? []
    const heroRow = heroes.find((h) => h.cr854_heroimageid === c._cr854_heroimage_value)
    const hero = heroImage(heroRow)
    const time = new Date(c.cr854_scheduledat!).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    const templateId = c.cr854_layoutkey || templateFromValue(c.cr854_emailtemplate)
    const progress = cardProgress(c, ids.length)
    const questions = questionCounts.get(id) ?? 0
    const tasks = taskCounts.get(id) ?? 0
    const overdue = overdueTasks.get(id) ?? 0
    const isPush = c.cr854_channel === PUSH
    const channel = c.cr854_channel === EMAIL ? 'email' : isPush ? 'push' : 'none'
    const sections = sectionsOf(templateId)
    const titles = (c.cr854_sectiontitles ?? '').split('\n')
    const groups = sections
      .map((sec) => {
        const [from, to] = sectionRange(sections, sec, ids.length)
        return { label: titles[sec.index]?.trim() || sec.label, ids: ids.slice(from, to) }
      })
      .filter((g) => g.ids.length > 0)
    const hasVisual = !!hero || ids.length > 0
    const hasPushText = isPush && !!(c.cr854_headline || c.cr854_copy)
    const items: Item[] = ids.map((pid, i) => ({ key: `${pid}-${i}`, productId: pid, reason: '', source: SOURCE_MANUAL }))
    const ratio = progress.total ? progress.done / progress.total : 0

    const issues = (
      <>
        {dueSoon?.has(id) && (
          <span className={mergeClasses(styles.issue, styles.issueWarn)}>
            <WarningFilled />
            {t('締切間近・未着手', 'Due soon, not started')}
          </span>
        )}
        {overdue > 0 && (
          <span className={mergeClasses(styles.issue, styles.issueBad)}>
            <TaskListLtrRegular />
            {t(`期日超過 ${overdue}`, `${overdue} overdue`)}
          </span>
        )}
        {questions > 0 && (
          <span className={mergeClasses(styles.issue, styles.issueWarn)}>
            <QuestionCircleFilled />
            {t(`未解決 ${questions}`, `${questions} open Q`)}
          </span>
        )}
      </>
    )
    const hasIssues = !!dueSoon?.has(id) || overdue > 0 || questions > 0

    const pushBox = hasPushText && (
      <div className={styles.push}>
        <span className={styles.pushTitle}>{c.cr854_headline || c.cr854_name}</span>
        {c.cr854_copy && <span className={styles.pushBody}>{c.cr854_copy}</span>}
      </div>
    )

    const peek = hasVisual && (
      <Popover openOnHover mouseLeaveDelay={100} positioning="after" withArrow>
        <PopoverTrigger disableButtonEnhancement>
          <span className={styles.peek} onClick={(e) => e.stopPropagation()}>
            <EyeRegular />
            {t('プレビュー', 'Preview')}
          </span>
        </PopoverTrigger>
        <PopoverSurface>
          <div className={styles.previewBox}>
            <div className={styles.previewInner}>
              <Preview
                channel={isPush ? 'push' : 'email'}
                subject={c.cr854_name}
                headline={c.cr854_headline ?? ''}
                copy={c.cr854_copy ?? ''}
                items={items}
                products={products}
                selectedKey={null}
                showHeadings
                template={templateId}
                scheduledAt={c.cr854_scheduledat ?? ''}
                sectionTitles={titles}
                onSectionTitle={noop}
                sectionCopies={parseCopies(c.cr854_sectioncopies)}
                onSectionCopy={noop}
                hero={heroRow}
                onDropHero={noop}
                onClearHero={noop}
                onSelect={noop}
                onRemove={noop}
                onMove={noop}
                onDropAt={noop}
              />
            </div>
          </div>
        </PopoverSurface>
      </Popover>
    )

    return (
      <button key={id} type="button" className={styles.card} onClick={() => onSelect(id)} title={c.cr854_name}>
        <div className={mergeClasses(styles.strip, channel === 'email' ? styles.stripEmail : channel === 'push' ? styles.stripPush : styles.stripNone)}>
          {channel === 'push' ? <PhoneRegular /> : <MailRegular />}
          {channel === 'email' ? t('メール', 'Email') : channel === 'push' ? t('アプリ', 'App') : t('チャネル未設定', 'No channel')}
          <span className={styles.stripTime}>{time}</span>
        </div>
        <div className={styles.inner}>
          <div className={styles.nameRow}>
            <span className={styles.dot} style={{ backgroundColor: statusColor(c.cr854_status) }} title={label(statusOptions, c.cr854_status)} />
            <span className={styles.name}>{c.cr854_name}</span>
          </div>
          {hasIssues && <div className={styles.issues}>{issues}</div>}

          {lens === 'products' ? (
            <>
              {pushBox}
              {hasVisual ? (
                <>
                  {hero && <div className={styles.hero}><img className={styles.img} src={hero} alt="" draggable={false} /></div>}
                  {groups.map((g, i) => (
                    <div key={i}>
                      <div className={styles.secLabel}>{`${g.label} · ${g.ids.length}`}</div>
                      {thumbs(g.ids)}
                    </div>
                  ))}
                </>
              ) : (
                !hasPushText && <span className={styles.empty}>{t('まだ中身がありません', 'No content yet')}</span>
              )}
            </>
          ) : (
            <>
              <div className={styles.progressRow}>
                {label(statusOptions, c.cr854_status)}
                <span className={styles.bar} aria-hidden>
                  <span className={styles.barFill} style={{ display: 'block', width: `${Math.round(ratio * 100)}%`, backgroundColor: statusColor(c.cr854_status) }} />
                </span>
                {`${progress.done}/${progress.total}`}
              </div>
              {c.cr854_theme && <span className={styles.text} title={c.cr854_theme}>{c.cr854_theme}</span>}
              {c.cr854_headline && (
                <span className={mergeClasses(styles.text, styles.textStrong)} title={c.cr854_headline}>
                  {c.cr854_headline}
                </span>
              )}
              {!isPush && <span className={styles.text}>{`${getTemplate(templateId).label} · ${t(`商品 ${ids.length}`, `${ids.length} products`)}`}</span>}
              <div className={styles.facts}>
                <span className={mergeClasses(styles.fact, !c.cr854_owner && styles.faint)} title={t('企画の担当者', 'Owner')}>
                  <PersonRegular />
                  {firstName(c.cr854_owner) || '—'}
                </span>
                <span className={mergeClasses(styles.fact, !c.cr854_productionowner && styles.faint)} title={t('制作の担当者', 'Production assignee')}>
                  <WrenchRegular />
                  {firstName(c.cr854_productionowner) || '—'}
                </span>
                <span className={mergeClasses(styles.fact, !c.cr854_productiondue && styles.faint)} title={t('制作の締め切り', 'Production due')}>
                  <CalendarRegular />
                  {shortDate(c.cr854_productiondue) || '—'}
                </span>
                <span className={mergeClasses(styles.fact, c.cr854_handedoffat ? styles.good : styles.faint)} title={t('制作への引き継ぎ', 'Handoff')}>
                  {c.cr854_handedoffat ? <CheckmarkCircleFilled /> : <CircleRegular />}
                  {c.cr854_handedoffat ? t('引き継ぎ済', 'Handed off') : t('未引き継ぎ', 'Not handed off')}
                </span>
                <span className={mergeClasses(styles.fact, !tasks && styles.faint)} title={t('未完了のタスク', 'Open tasks')}>
                  <TaskListLtrRegular />
                  {tasks ? t(`タスク ${tasks}`, `${tasks} task${tasks === 1 ? '' : 's'}`) : t('タスクなし', 'No tasks')}
                </span>
              </div>
            </>
          )}
          {peek}
        </div>
      </button>
    )
  }

  return (
    <div className={styles.root}>
      {days.map((d) => {
        const k = dayKey(d)
        return (
          <div key={k} className={styles.col}>
            <div className={mergeClasses(styles.head, k === today && styles.today)}>
              <span>{d.toLocaleDateString(locale(), { weekday: 'short', month: 'numeric', day: 'numeric' })}</span>
              <button type="button" className={styles.add} onClick={() => onCreate(k)} aria-label={t('この日に新規作成', 'New delivery on this day')} title={t('この日に新規作成', 'New delivery on this day')}>
                <AddRegular />
              </button>
            </div>
            <div className={styles.body}>{(byDay.get(k) ?? []).map(card)}</div>
          </div>
        )
      })}
    </div>
  )
}
