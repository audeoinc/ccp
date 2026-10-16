import { makeStyles, tokens } from '@fluentui/react-components'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { WeekRow } from './data/weeks'
import type { CardEvent } from './data/events'
import type { CardNote } from './data/cardNotes'
import type { CheckItem } from './reviewChecks'
import { CardPreview } from './CardPreview'
import { locale, optionLabel, useT } from './i18n'
import { CHANNEL_PUSH, statusOptions } from './status'
import { actionText, checkTitle } from './weekLabels'

// 紙(A4 縦)に出す前提の、週の資料。画面には出さない(印刷のあいだだけ、index.css の「週の資料の印刷」で見せる)。
// 紙に出すので、線と見出しの背景は淡く、文字は濃くする
const useStyles = makeStyles({
  root: { width: '718px', color: tokens.colorNeutralForeground1, backgroundColor: tokens.colorNeutralBackground1, fontSize: '11px', lineHeight: 1.45 },
  head: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', columnGap: '12px', borderBottom: `2px solid ${tokens.colorNeutralForeground1}`, paddingBottom: '6px', marginBottom: '10px' },
  title: { fontSize: '18px', fontWeight: 700 },
  sub: { fontSize: '10px', color: tokens.colorNeutralForeground3 },
  h2: { fontSize: '13px', fontWeight: 700, margin: '14px 0 6px' },
  table: { width: '100%', borderCollapse: 'collapse', '& th, & td': { border: `1px solid ${tokens.colorNeutralStroke1}`, padding: '3px 5px', textAlign: 'left', verticalAlign: 'top' }, '& th': { backgroundColor: tokens.colorNeutralBackground3, fontWeight: 600 } },
  num: { textAlign: 'right', whiteSpace: 'nowrap' },
  nowrap: { whiteSpace: 'nowrap' },
  muted: { color: tokens.colorNeutralForeground3 },
  warn: { color: tokens.colorPaletteDarkOrangeForeground1, fontWeight: 600 },
  ok: { color: tokens.colorPaletteGreenForeground1, fontWeight: 600 },
  // 配信 1 本の頁(プレビューは、メールの幅のまま描いて縮める。倍率は、印刷の直前に printWeek が、1 頁に収まるように決める)
  delivery: { breakBefore: 'page', display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', columnGap: '16px', alignItems: 'start' },
  previewBox: { width: '320px', border: `1px solid ${tokens.colorNeutralStroke1}`, overflow: 'hidden' },
  preview: { width: '640px', zoom: 0.5 },
  facts: { display: 'grid', rowGap: '6px' },
  dName: { fontSize: '15px', fontWeight: 700 },
  label: { fontSize: '10px', color: tokens.colorNeutralForeground3, fontWeight: 600 },
  value: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  list: { margin: 0, paddingLeft: '16px' },
})

interface Props {
  weekStart: Date
  week?: WeekRow
  /** この週の配信(取りやめを除く。配信日時の順) */
  cards: DeliveryCard[]
  cardProducts: Map<string, string[]>
  products: Product[]
  heroes: HeroImage[]
  checklist: CheckItem[]
  /** この週の承認の履歴(新しい順) */
  events: CardEvent[]
  /** 配信ごとの、未対応のレビューのコメント */
  openComments: Map<string, CardNote[]>
  /** 資料を作った人(画面で入れた名前) */
  author: string
}

/**
 * 週の資料(バックログ W7)。レビューの会議で配る、週の計画のまとめ。
 * 1 枚目に、週の状態・確認の一覧・配信の一覧・承認の履歴。2 枚目からは、配信 1 本ずつ、プレビューと中身・未対応のコメント
 */
export function WeekReport({ weekStart, week, cards, cardProducts, products, heroes, checklist, events, openComments, author }: Props) {
  const s = useStyles()
  const t = useT()
  const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)
  const day = (d: Date) => d.toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' })
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '')
  const stamp = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
  const statusName = (v?: string | null) => (v === undefined || v === null ? '' : optionLabel(statusOptions.find((o) => o.value === v)?.label))
  const channelName = (c: DeliveryCard) => (c.channel === CHANNEL_PUSH ? t('アプリ', 'App') : t('メール', 'Email'))
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? ''
  const weekStatus = week?.status === 'confirmed' ? t('確定', 'Confirmed') : week?.status === 'review' ? t('レビュー中', 'In review') : t('下書き', 'Draft')

  return (
    <div className={s.root}>
      <div className={s.head}>
        <span className={s.title}>{t(`週の計画 ${day(weekStart)} 〜 ${day(end)}`, `Week plan ${day(weekStart)} – ${day(end)}`)}</span>
        <span className={s.sub}>
          {t(`週の状態: ${weekStatus} ・ 作成 ${stamp(new Date().toISOString())}`, `Status: ${weekStatus} · Created ${stamp(new Date().toISOString())}`)}
          {author ? ` ・ ${author}` : ''}
        </span>
      </div>

      <div className={s.h2}>{t('確認の一覧', 'Review checklist')}</div>
      <table className={s.table}>
        <tbody>
          {checklist.map((i) => (
            <tr key={i.key}>
              <td className={i.ok ? s.ok : s.warn} style={{ width: '16px' }}>{i.ok ? '✓' : '!'}</td>
              <td className={s.nowrap}>{checkTitle(t, i.key)}</td>
              <td className={s.num}>{i.total !== undefined ? `${i.count} / ${i.total}` : i.count}</td>
              <td>{i.details.join('、')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={s.h2}>{t(`配信の一覧(${cards.length} 本)`, `Deliveries (${cards.length})`)}</div>
      <table className={s.table}>
        <thead>
          <tr>
            <th>{t('日時', 'When')}</th>
            <th>{t('チャネル', 'Channel')}</th>
            <th>{t('ステータス', 'Status')}</th>
            <th>{t('配信名', 'Name')}</th>
            <th>{t('テーマ', 'Theme')}</th>
            <th>{t('商品', 'Items')}</th>
            <th>{t('コメント', 'Comments')}</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id}>
              <td className={s.nowrap}>{when(c.scheduled_at)}</td>
              <td className={s.nowrap}>{channelName(c)}</td>
              <td className={s.nowrap}>{statusName(c.status)}</td>
              <td>{c.name}</td>
              <td>{c.theme}</td>
              <td className={s.num}>{(cardProducts.get(c.id) ?? []).length}</td>
              <td className={s.num}>{openComments.get(c.id)?.length || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={s.h2}>{t('承認の履歴', 'Approval history')}</div>
      {events.length === 0 ? (
        <div className={s.muted}>{t('まだ記録はありません', 'Nothing recorded yet')}</div>
      ) : (
        <table className={s.table}>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className={s.nowrap}>{stamp(e.created_on)}</td>
                <td className={s.nowrap}>{e.actor || t('(名前なし)', '(no name)')}</td>
                <td>
                  {e.card_name ? `${e.card_name}: ` : ''}
                  {actionText(t, e.action)}
                  {e.to_status !== undefined && e.to_status !== null && e.to_status !== e.from_status
                    ? `(${statusName(e.from_status) ? `${statusName(e.from_status)} ` : ''}→ ${statusName(e.to_status)})`
                    : ''}
                  {e.note ? <div className={s.muted}>{e.note}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {cards.map((c) => {
        const ids = cardProducts.get(c.id) ?? []
        const comments = openComments.get(c.id) ?? []
        return (
          <div key={c.id} className={s.delivery}>
            <div className={s.previewBox}>
              <div className={s.preview} data-week-preview>
                <CardPreview card={c} productIds={ids} products={products} heroes={heroes} />
              </div>
            </div>
            <div className={s.facts}>
              <div>
                <div className={s.dName}>{c.name}</div>
                <div className={s.sub}>{`${when(c.scheduled_at)} ・ ${channelName(c)} ・ ${statusName(c.status)}`}</div>
              </div>
              {[
                [t('テーマ', 'Theme'), c.theme],
                [t('ヘッドライン', 'Headline'), c.headline],
                [t('コピー', 'Copy'), c.copy],
                [t('担当', 'Owner'), c.owner],
                [t('制作の担当・締め切り', 'Production'), [c.production_owner, c.production_due?.slice(0, 10)].filter(Boolean).join(' ・ ')],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <div className={s.label}>{k}</div>
                    <div className={s.value}>{v}</div>
                  </div>
                ))}
              {ids.length > 0 && (
                <div>
                  <div className={s.label}>{t(`商品(${ids.length})`, `Items (${ids.length})`)}</div>
                  <div className={s.value}>{ids.map(productName).filter(Boolean).join('、')}</div>
                </div>
              )}
              <div>
                <div className={s.label}>{t(`未対応のコメント(${comments.length})`, `Open comments (${comments.length})`)}</div>
                {comments.length === 0 ? (
                  <div className={s.muted}>{t('ありません', 'None')}</div>
                ) : (
                  <ul className={s.list}>
                    {comments.map((n) => (
                      <li key={n.id} className={s.value}>
                        {`${n.author || t('(名前なし)', '(no name)')}: ${n.body ?? ''}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
