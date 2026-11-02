// 結果の面の一覧の「キャンペーン」のまとめ方(X89・X79 (c) の c-2。2026-11-02 利用者がおすすめどおりに決定)。
// 行 = キャンペーン(子の配信カードの合計)。▸ で開くと子の配信カード、AB テストの配信はさらに ▸ で案の行(木の形の表)。
// キャンペーンの合計は保存せず、子のカードの結果から計算する(utm_campaign はカード単位のまま。req-campaign.md)
import { Fragment, useState } from 'react'
import { Button, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronRightRegular, TrophyRegular } from '@fluentui/react-icons'
import type { Campaign } from '../models/campaigns'
import type { DeliveryCard } from '../models/deliveryCards'
import { ChannelBadge } from '../ChannelBadge'
import { abVerdict } from '../abResults'
import { isChoose, parseAbTest } from '../abTest'
import { isPush, pct, sentAtOf, type ResultRow } from '../results'
import { sumOf, type Sum } from './resultSums'
import { locale, useT } from '../i18n'

const useStyles = makeStyles({
  num: { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  name: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  // 木の段ごとの字下げ
  lv1: { paddingLeft: '28px' },
  lv2: { paddingLeft: '56px' },
  top: { fontWeight: tokens.fontWeightSemibold },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  // 名前と時刻を縦に(狭い所でも、数字の列と重ならないように)
  label: { display: 'grid', minWidth: 0 },
  click: { cursor: 'pointer' },
  win: { color: tokens.colorPaletteMarigoldForeground1 },
  toggle: { minWidth: 'auto', width: '24px', height: '24px', padding: 0 },
  spacer: { display: 'inline-block', width: '24px' },
})

interface Props {
  rows: ResultRow[]
  campaigns: Map<string, Campaign>
  money: (v?: number, c?: DeliveryCard) => string
  /** 配信の結果を開く */
  onOpen: (cardId: string) => void
  /** 狭い所(結果のシンプルな画面のペイン)に置く: 列をクリック率・売上だけにする */
  compact?: boolean
}

export function CampaignResultsTable({ rows, campaigns, money, onOpen, compact }: Props) {
  const s = useStyles()
  const t = useT()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setOpen((o) => (o.has(k) ? new Set([...o].filter((x) => x !== k)) : new Set([...o, k])))
  const n = (v: number) => v.toLocaleString(locale())
  const ratio = (a: number, b: number) => (b ? a / b : undefined)
  const time = (r: ResultRow) => {
    const at = sentAtOf(r)
    return at ? new Date(at).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
  }

  // キャンペーンごとに束ねる(キャンペーンに入っていない配信は、1 本で 1 行)。並びは、いちばん早い配信の順
  const groups = new Map<string, ResultRow[]>()
  for (const r of rows) {
    const k = r.card.campaign_id && campaigns.has(r.card.campaign_id) ? r.card.campaign_id : `card:${r.card.id}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const ordered = [...groups.entries()].sort(([, a], [, b]) => (sentAtOf(a[0]) ?? '').localeCompare(sentAtOf(b[0]) ?? ''))

  const toggleBtn = (k: string, label: string) => (
    <Button size="small" appearance="transparent" className={s.toggle} icon={open.has(k) ? <ChevronDownRegular /> : <ChevronRightRegular />} aria-expanded={open.has(k)} aria-label={label} onClick={(e) => (e.stopPropagation(), toggle(k))} />
  )
  // 数字の列(送った数・開封率・クリック率・注文・売上)
  const cells = (x: Sum, card?: DeliveryCard) => (
    <>
      {!compact && <TableCell className={s.num}>{n(x.recipients)}</TableCell>}
      {!compact && <TableCell className={s.num}>{x.emailRecipients ? pct(ratio(x.opens, x.emailRecipients)) : '—'}</TableCell>}
      <TableCell className={s.num}>{pct(ratio(x.clicks, x.recipients))}</TableCell>
      {!compact && <TableCell className={s.num}>{n(x.orders)}</TableCell>}
      <TableCell className={s.num}>{money(x.revenue, card)}</TableCell>
    </>
  )

  const cardRows = (r: ResultRow, level: 'child' | 'top') => {
    const ab = parseAbTest(r.card.ab_test)
    const v = r.parts.length > 0 && !isChoose(ab) ? abVerdict(r.parts, ab, isPush(r.card)) : null
    const hasVariants = !!v && v.stats.length > 1
    const k = `ab:${r.card.id}`
    return (
      <Fragment key={r.card.id}>
        <TableRow className={s.click} onClick={() => onOpen(r.card.id)}>
          <TableCell className={level === 'child' ? s.lv1 : undefined}>
            <span className={s.name}>
              {hasVariants ? toggleBtn(k, t('案を開く', 'Show variants')) : <span className={s.spacer} />}
              <ChannelBadge channel={r.card.channel} size="small" />
              <span className={s.label}>
                <span>{level === 'top' ? r.card.name : time(r)}</span>
                {level === 'top' && <span className={s.sub}>{time(r)}</span>}
              </span>
            </span>
          </TableCell>
          {cells(sumOf([r]), r.card)}
        </TableRow>
        {hasVariants &&
          open.has(k) &&
          v.stats.map((st) => (
            <TableRow key={`${r.card.id}:${st.key}`} className={s.click} onClick={() => onOpen(r.card.id)}>
              <TableCell className={level === 'child' ? s.lv2 : s.lv1}>
                <span className={s.name}>
                  {t(`案 ${st.key}`, `Variant ${st.key}`)}
                  {v.winner?.key === st.key && v.confidence !== 'tooFew' && <TrophyRegular className={s.win} aria-label={t('勝ち案', 'Winner')} />}
                </span>
              </TableCell>
              {cells({ recipients: st.recipients, emailRecipients: isPush(r.card) ? 0 : st.recipients, opens: st.opens, clicks: isPush(r.card) ? st.opens : st.clicks, orders: st.orders, revenue: st.revenue }, r.card)}
            </TableRow>
          ))}
      </Fragment>
    )
  }

  return (
    <Table size="small" style={{ tableLayout: 'auto' }} aria-label={t('キャンペーンごとの結果', 'Results by campaign')}>
      <TableHeader>
        <TableRow>
          <TableHeaderCell>{t('キャンペーン・配信・案', 'Campaign, delivery, variant')}</TableHeaderCell>
          {!compact && <TableHeaderCell className={s.num}>{t('送った数', 'Sent')}</TableHeaderCell>}
          {!compact && <TableHeaderCell className={s.num}>{t('開封率', 'Open rate')}</TableHeaderCell>}
          <TableHeaderCell className={s.num}>{t('クリック率', 'Click rate')}</TableHeaderCell>
          {!compact && <TableHeaderCell className={s.num}>{t('注文', 'Orders')}</TableHeaderCell>}
          <TableHeaderCell className={s.num}>{t('売上', 'Revenue')}</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordered.map(([k, list]) => {
          const campaign = k.startsWith('card:') ? undefined : campaigns.get(k)
          if (!campaign) return cardRows(list[0], 'top')
          return (
            <Fragment key={k}>
              <TableRow className={s.click} onClick={() => toggle(k)}>
                <TableCell>
                  <span className={mergeClasses(s.name, s.top)}>
                    {toggleBtn(k, t('配信を開く', 'Show deliveries'))}
                    {campaign.name}
                    <span className={s.sub}>{t(`${list.length} 本`, `${list.length} deliveries`)}</span>
                  </span>
                </TableCell>
                {/* 合計の金額は、キャンペーンの国の通貨(キャンペーンは国をまたがない) */}
                {cells(sumOf(list), list[0].card)}
              </TableRow>
              {open.has(k) && list.map((r) => cardRows(r, 'child'))}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
