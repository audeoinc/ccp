import { useState, type ReactNode } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import {
  AddRegular,
  CalendarRegular,
  CheckmarkCircleFilled,
  CircleRegular,
  CommentRegular,
  EyeRegular,
  MailFilled,
  PersonRegular,
  PhoneFilled,
  QuestionCircleFilled,
  TaskListLtrRegular,
  WarningFilled,
  WrenchRegular,
} from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { heroImage, productImage } from './images'
import { locale, useT } from './i18n'
import { DeliveryPeek } from './DeliveryPeek'
import { cardProgress } from './progress'
import { statusColor, statusLabel } from './status'
import { LockMark } from './LockMark'
import { DEFAULT_PUSH_TEMPLATE, getTemplate, sectionRange, sectionsOf, templateFromValue } from './templates'
import { CANCELLED_STYLE, isCancelled } from './cancel'
import { AlertMark } from './AlertMark'
import { AiIcon } from './AiMark'
import type { CardAlertKind } from './cardAlerts'

/** 週の表示の見方。products = 商品のバランスを見る / progress = 進み具合を見る */
export type WeekLens = 'products' | 'progress'

interface Props {
  /** 週の初め(日曜日) */
  start: Date
  cards: DeliveryCard[]
  /** 配信カードごとの掲載商品(メールの並び順の商品 ID) */
  cardProducts: Map<string, string[]>
  /** 配信カードごとの、質問の未解決の数 */
  questionCounts: Map<string, number>
  /** 配信カードごとの、未完了のタスクの数 */
  taskCounts: Map<string, number>
  /** 配信カードごとの、未対応のレビューのコメントの数 */
  commentCounts?: Map<string, number>
  /** 配信カードごとの、期日を過ぎた未完了のタスクの数 */
  overdueTasks: Map<string, number>
  lens: WeekLens
  products: Product[]
  heroes: HeroImage[]
  dueSoon?: Set<string>
  /** 確認の一覧(W4)で選んだ項目の、目立たせる配信と商品。配信が空なら、配信は薄くしない */
  focus?: { cards: Set<string>; products: Set<string> }
  /** アラートのある配信(いちばん強い種類。印を付ける) */
  alertKinds?: Map<string, CardAlertKind>
  onSelect: (id: string) => void
  /** その日付で新規作成する(値は YYYY-MM-DD) */
  onCreate: (day: string) => void
  /** 配信の描き方を差し替える(中身のない配信(週の枠)を、その場で入力できる形で出す。W14)。null なら、ふつうに描く */
  renderCard?: (c: DeliveryCard) => ReactNode | null
  /** 「AI 下書き・未確認」の印を押したとき(確かめる引き出しを開く。W14) */
  onCheck?: (id: string) => void
  /** 配信の状態の色と名前を差し替える(制作の面では、制作の状態。なければ計画のステータス) */
  stateOf?: (c: DeliveryCard) => { color: string; label: string }
  /** 配信名の下に出す 1 行(制作の面の、状態と締め切り) */
  renderMeta?: (c: DeliveryCard) => ReactNode
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const EMAIL = 'email'
const PUSH = 'app'
// 1 日の並び: メールを上、プッシュを下にそろえる(週を横に見比べやすく)。同じチャネルの中は時刻順
const rank = (c: DeliveryCard) => (c.channel === EMAIL ? 0 : c.channel === PUSH ? 1 : 2)
const order = (a: DeliveryCard, b: DeliveryCard) => rank(a) - rank(b) || (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')
const shortDate = (ymd?: string) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale(), { month: '2-digit', day: '2-digit' })
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
  // 確認の一覧で選んだ項目に、かかわる配信と、かかわらない配信
  cardFocus: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '-1px' },
  cardDim: { opacity: 0.4 },
  // AI でまとめて作り、まだ人が確かめていない配信の印(押すと、確かめる引き出し。破線で、ふつうの印と形を分ける)
  issueAi: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, border: `1px dashed ${tokens.colorBrandStroke1}`, cursor: 'pointer' },
  // チャネルの帯(メールとアプリを、色とアイコンで見分ける)
  strip: { display: 'flex', alignItems: 'center', columnGap: '4px', padding: '3px 8px', fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold },
  // 帯は、配信カードの札と同じ、塗りつぶしの地に白抜き(メール = 青、アプリ = ベリー)
  stripEmail: { backgroundColor: tokens.colorPaletteBlueBorderActive, color: '#ffffff' },
  stripPush: { backgroundColor: tokens.colorPaletteBerryBorderActive, color: '#ffffff' },
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
  // 制作の面の、状態と締め切りの 1 行
  meta: { display: 'block', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
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
})

/**
 * 1 週間の配信を横に並べる。見方(lens)を切り替えて、目的に合う情報だけを出す。
 * - 商品: メイン画像と掲載商品の全点(かぶり・バランスを見る)
 * - 進み具合: ステータス・工程・担当・締め切り・引き継ぎ・タスク
 * どちらの見方でも、問題(締め切りが近いのに未着手・期日を過ぎたタスク・未解決の質問)は、色の印で出す。
 */
export function WeekView({ start, cards, cardProducts, questionCounts, taskCounts, commentCounts, overdueTasks, lens, products, heroes, dueSoon, focus, alertKinds, onSelect, onCreate, renderCard, onCheck, stateOf, renderMeta }: Props) {
  const styles = useStyles()
  const t = useT()
  const [hover, setHover] = useState<string | null>(null)
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const today = dayKey(new Date())
  const byDay = new Map<string, DeliveryCard[]>()
  for (const c of cards) {
    if (!c.scheduled_at) continue
    const k = dayKey(new Date(c.scheduled_at))
    byDay.set(k, [...(byDay.get(k) ?? []), c])
  }
  for (const list of byDay.values()) list.sort(order)
  const productOf = (id: string) => products.find((p) => p.id === id)

  const thumbs = (ids: string[]) => (
    <div className={styles.grid}>
      {ids.map((id, i) => {
        const p = productOf(id)
        const src = productImage(p)
        return (
          <div
            key={`${id}-${i}`}
            className={mergeClasses(styles.thumb, (hover ? hover === id : !!focus?.products.has(id)) && styles.thumbHit, !!hover && hover !== id && styles.thumbDim)}
            title={p?.name}
            onMouseEnter={() => setHover(id)}
            onMouseLeave={() => setHover(null)}
          >
            {src && <img className={styles.img} src={src} alt={p?.name ?? ''} draggable={false} />}
          </div>
        )
      })}
    </div>
  )

  const card = (c: DeliveryCard) => {
    const id = c.id
    const ids = cardProducts.get(id) ?? []
    const heroRow = heroes.find((h) => h.id === c.hero_image_id)
    const hero = heroImage(heroRow)
    const time = new Date(c.scheduled_at!).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    const templateId = c.layout_key || (c.channel === PUSH ? DEFAULT_PUSH_TEMPLATE : templateFromValue(c.email_template))
    const progress = cardProgress(c, ids.length)
    const questions = questionCounts.get(id) ?? 0
    const tasks = taskCounts.get(id) ?? 0
    const comments = commentCounts?.get(id) ?? 0
    const overdue = overdueTasks.get(id) ?? 0
    const isPush = c.channel === PUSH
    const channel = c.channel === EMAIL ? 'email' : isPush ? 'push' : 'none'
    const sections = sectionsOf(templateId)
    const titles = (c.section_titles ?? '').split('\n')
    const groups = sections
      .map((sec) => {
        const [from, to] = sectionRange(sections, sec, ids.length)
        return { label: titles[sec.index]?.trim() || sec.label, ids: ids.slice(from, to) }
      })
      .filter((g) => g.ids.length > 0)
    const hasVisual = !!hero || ids.length > 0
    const hasPushText = isPush && !!(c.push_title || c.push_body || c.headline || c.copy)
    const ratio = progress.total ? progress.done / progress.total : 0
    const state = stateOf ? stateOf(c) : { color: statusColor(c.status), label: statusLabel(c.status) }

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
        {comments > 0 && (
          <span className={mergeClasses(styles.issue, styles.issueWarn)}>
            <CommentRegular />
            {t(`コメント ${comments}`, `${comments} comment${comments === 1 ? '' : 's'}`)}
          </span>
        )}
        {c.ai_unchecked_at && (
          <span
            role="button"
            tabIndex={0}
            className={mergeClasses(styles.issue, styles.issueAi)}
            title={t('AI でまとめて作った中身を、まだ誰も確かめていません。押すと、中身と前後の配信を確かめられます', 'Nobody has checked this AI-made content yet. Click to check it against nearby deliveries')}
            onClick={(e) => {
              e.stopPropagation()
              onCheck?.(id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation()
                onCheck?.(id)
              }
            }}
          >
            <AiIcon size={10} />
            {t('AI 下書き・未確認', 'AI draft, unchecked')}
          </span>
        )}
      </>
    )
    const hasIssues = !!dueSoon?.has(id) || overdue > 0 || questions > 0 || comments > 0 || !!c.ai_unchecked_at

    const pushBox = hasPushText && (
      <div className={styles.push}>
        <span className={styles.pushTitle}>{c.push_title || c.headline || c.name}</span>
        {(c.push_body || c.copy) && <span className={styles.pushBody}>{c.push_body || c.copy}</span>}
      </div>
    )

    const peek = hasVisual && (
      <DeliveryPeek card={c} productIds={ids} products={products} heroes={heroes}>
        <span className={styles.peek} onClick={(e) => e.stopPropagation()}>
          <EyeRegular />
          {t('プレビュー', 'Preview')}
        </span>
      </DeliveryPeek>
    )

    return (
      <button
        key={id}
        type="button"
        className={mergeClasses(styles.card, !!focus?.cards.size && (focus.cards.has(id) ? styles.cardFocus : styles.cardDim))}
        onClick={() => onSelect(id)}
        title={c.name}
        // 取りやめた配信は、消さずに薄く、取り消し線で出す
        style={isCancelled(c) ? CANCELLED_STYLE : undefined}
      >
        <div className={mergeClasses(styles.strip, channel === 'email' ? styles.stripEmail : channel === 'push' ? styles.stripPush : styles.stripNone)}>
          {channel === 'push' ? <PhoneFilled /> : <MailFilled />}
          {channel === 'email' ? t('メール', 'Email') : channel === 'push' ? t('アプリ', 'App') : t('チャネル未設定', 'No channel')}
          <span className={styles.stripTime}>{time}</span>
        </div>
        <div className={styles.inner}>
          <div className={styles.nameRow}>
            <span className={styles.dot} style={{ backgroundColor: state.color }} title={state.label} />
            {!stateOf && <LockMark status={c.status} />}
            <AlertMark kind={alertKinds?.get(id)} />
            <span className={styles.name}>{isCancelled(c) ? `${t('取りやめ', 'Cancelled')}・${c.name}` : c.name}</span>
          </div>
          {renderMeta && <span className={styles.meta}>{renderMeta(c)}</span>}
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
                {state.label}
                <span className={styles.bar} aria-hidden>
                  <span className={styles.barFill} style={{ display: 'block', width: `${Math.round(ratio * 100)}%`, backgroundColor: state.color }} />
                </span>
                {`${progress.done}/${progress.total}`}
              </div>
              {c.theme && <span className={styles.text} title={c.theme}>{c.theme}</span>}
              {c.headline && (
                <span className={mergeClasses(styles.text, styles.textStrong)} title={c.headline}>
                  {c.headline}
                </span>
              )}
              {!isPush && <span className={styles.text}>{`${getTemplate(templateId).label} · ${t(`商品 ${ids.length}`, `${ids.length} products`)}`}</span>}
              <div className={styles.facts}>
                <span className={mergeClasses(styles.fact, !c.owner && styles.faint)} title={t('企画の担当者', 'Owner')}>
                  <PersonRegular />
                  {firstName(c.owner) || '—'}
                </span>
                <span className={mergeClasses(styles.fact, !c.production_owner && styles.faint)} title={t('制作の担当者', 'Production assignee')}>
                  <WrenchRegular />
                  {firstName(c.production_owner) || '—'}
                </span>
                <span className={mergeClasses(styles.fact, !c.production_due && styles.faint)} title={t('制作の締め切り', 'Production due')}>
                  <CalendarRegular />
                  {shortDate(c.production_due) || '—'}
                </span>
                <span className={mergeClasses(styles.fact, c.handed_off_at ? styles.good : styles.faint)} title={t('制作への引き継ぎ', 'Handoff')}>
                  {c.handed_off_at ? <CheckmarkCircleFilled /> : <CircleRegular />}
                  {c.handed_off_at ? t('引き継ぎ済', 'Handed off') : t('未引き継ぎ', 'Not handed off')}
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
            <div className={styles.body}>
              {(byDay.get(k) ?? []).map((c) => renderCard?.(c) ?? card(c))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
