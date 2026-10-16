import { useState, type ReactNode } from 'react'
import {
  Button,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  MessageBar,
  MessageBarBody,
  OverlayDrawer,
  Tab,
  TabList,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { ArrowClockwiseRegular, DismissRegular, EditRegular, MailRegular, PhoneRegular, WarningFilled } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { locale, useT } from './i18n'
import { CardPreview } from './CardPreview'
import { FitPreview } from './FitPreview'
import { MarkdownLite } from './MarkdownLite'
import { CHANNEL_PUSH } from './status'
import { getTemplate } from './templates'
import { dayKeyOf } from './weekLock'
import { draftCard, draftProductIds, type Draft } from './bulkDraft'
import type { BulkDrafts } from './useBulkDrafts'

const useStyles = makeStyles({
  // 週の表示を見ながら使うので、画面全体は覆わず、右に重ねる
  drawer: { width: 'min(760px, 92vw)' },
  head: { display: 'grid', rowGap: '8px' },
  tools: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  spacer: { flexGrow: 1 },
  content: { display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', columnGap: '16px', alignItems: 'start', '@media (max-width: 899px)': { gridTemplateColumns: '1fr', rowGap: '12px' } },
  previewBox: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '8px', backgroundColor: tokens.colorNeutralBackground2, display: 'grid', justifyItems: 'center' },
  facts: { display: 'grid', rowGap: '10px', minWidth: 0 },
  label: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  value: { fontSize: '12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  md: { fontSize: '12px', overflowWrap: 'anywhere' },
  reason: { fontSize: '12px', color: tokens.colorNeutralForeground3, whiteSpace: 'pre-wrap' },
  secBox: { display: 'grid', rowGap: '4px', padding: '8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
  list: { margin: 0, paddingLeft: '18px', fontSize: '12px' },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  compare: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', columnGap: '10px', rowGap: '10px', alignItems: 'start' },
  cmpCol: { display: 'grid', rowGap: '6px', padding: '8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  cmpColDraft: { border: `1.5px dashed ${tokens.colorBrandStroke1}` },
  cmpRole: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  line: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0 },
  name: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  same: { display: 'inline-flex', alignItems: 'center', columnGap: '3px', color: tokens.colorPaletteDarkOrangeForeground1, fontSize: '12px', fontWeight: tokens.fontWeightSemibold },
  prod: { fontSize: '12px', padding: '1px 4px', borderRadius: tokens.borderRadiusSmall, border: '1px solid transparent' },
  // 重なる商品は、枠で囲む(色だけに頼らない)
  prodHit: { border: `1.5px solid ${tokens.colorPaletteDarkOrangeBorder2}`, fontWeight: tokens.fontWeightSemibold },
})

interface Props {
  bulk: BulkDrafts
  /** すべての配信(取りやめを除く) */
  cards: DeliveryCard[]
  products: Product[]
  heroes: HeroImage[]
  /** 配信カードを上に重ねて、この下書きを直す */
  onEdit: (d: Draft) => void
}

const timeOf = (iso?: string) => (iso ? new Date(iso).getTime() : 0)
const norm = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ')

/**
 * 選んだ下書きの中身(プレビュー・全項目・AI の理由)と、前後の配信との比較を、右の引き出しで見せる。
 * 週の表示は、引き出しの左に見えたままにする(下書きを替えながら、並びと見比べられるように)
 */
export function DraftDrawer({ bulk, cards, products, heroes, onEdit }: Props) {
  const s = useStyles()
  const t = useT()
  const [tab, setTab] = useState<'content' | 'compare'>('content')
  const d = bulk.selected
  const open = !!d && d.state !== 'saved'
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '')

  const fact = (labelText: string, value?: string, reason?: string, reasonLabel?: string): ReactNode =>
    value ? (
      <div>
        <div className={s.label}>{labelText}</div>
        <div className={s.value}>{value}</div>
        {reason && <div className={s.reason}>{`${reasonLabel ?? t('理由', 'Why')}: ${reason}`}</div>}
      </div>
    ) : null

  const contentPane = (sel: Draft) => {
    if (sel.state !== 'done' || !sel.result) return <div className={s.muted}>{t('この下書きは、まだできていません。帯の「AI で作る」で作ります。', 'This draft is not created yet. Use “Create with AI” in the bar.')}</div>
    const r = sel.result
    const card = draftCard(sel, products)
    const pname = (id: string) => products.find((p) => p.id === id)?.name ?? id
    return (
      <div className={s.content}>
        <div className={s.previewBox}>
          <FitPreview maxWidth={280}>
            <CardPreview card={card} productIds={draftProductIds(sel)} products={products} heroes={heroes} />
          </FitPreview>
        </div>
        <div className={s.facts}>
          {sel.error && (
            <MessageBar intent="warning" layout="multiline">
              <MessageBarBody>{t(`一部の工程で失敗しました: ${sel.error}`, `Some steps failed: ${sel.error}`)}</MessageBarBody>
            </MessageBar>
          )}
          {fact(t('テーマ', 'Theme'), r.theme, r.themeIdeas[0]?.reason)}
          {sel.hint && fact(t('テーマのヒント', 'Theme hint'), sel.hint)}
          {fact(t('テンプレート', 'Template'), r.template ? getTemplate(r.template).label : undefined, r.templateReason)}
          {fact(t('メイン画像', 'Hero image'), r.hero?.hero ? heroes.find((h) => h.id === r.hero!.hero!.heroId)?.name : undefined, r.hero?.hero?.reason)}
          {fact(t('ヘッドライン', 'Headline'), r.headline)}
          {fact(t('コピー', 'Copy'), r.copy, r.copyIdeas[0]?.angle, t('切り口', 'Angle'))}
          {r.sections.map((sec, i) => (
            <div key={i} className={s.secBox}>
              <div className={s.label}>{t(`セクション ${i + 1}`, `Section ${i + 1}`)}</div>
              {sec.title && <div className={s.value}>{sec.title}</div>}
              {sec.copy && <div className={s.reason}>{sec.copy}</div>}
              {sec.selected.length > 0 && (
                <ul className={s.list}>
                  {sec.selected.map((p) => (
                    <li key={p.productId}>
                      {pname(p.productId)}
                      {p.reason && <span className={s.muted}>{` — ${p.reason}`}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {fact(t('通知のタイトル', 'Notification title'), r.pushTitle)}
          {fact(t('通知の本文', 'Notification body'), r.pushBody)}
          {r.instructions && (
            <div>
              <div className={s.label}>{t('制作指示', 'Production notes')}</div>
              <div className={s.md}>
                <MarkdownLite text={r.instructions} />
              </div>
              {r.instructionIdeas[0]?.angle && <div className={s.reason}>{`${t('切り口', 'Angle')}: ${r.instructionIdeas[0].angle}`}</div>}
            </div>
          )}
        </div>
      </div>
    )
  }

  const comparePane = (sel: Draft) => {
    if (sel.state !== 'done') return <div className={s.muted}>{t('下書きができたら、前後の配信と比べられます', 'Once the draft is created, you can compare it with the deliveries around it')}</div>
    const me = draftCard(sel, products)
    const myIds = new Set(draftProductIds(sel))
    const pool: { c: DeliveryCard; d?: Draft }[] = [
      ...cards.map((c) => ({ c })),
      ...bulk.liveCards.filter((x) => x.draft.key !== sel.key && x.draft.state === 'done').map((x) => ({ c: x.card, d: x.draft })),
    ]
    const at = timeOf(me.scheduled_at)
    const same = pool.filter((x) => x.c.channel === me.channel && x.c.scheduled_at).sort((a, b) => timeOf(a.c.scheduled_at) - timeOf(b.c.scheduled_at))
    const prev = [...same].reverse().find((x) => timeOf(x.c.scheduled_at) < at)
    const next = same.find((x) => timeOf(x.c.scheduled_at) > at)
    const sameDay = pool.filter((x) => x.c.channel !== me.channel && x.c.scheduled_at && dayKeyOf(new Date(x.c.scheduled_at)) === dayKeyOf(new Date(sel.scheduledAt)))
    const col = (role: string, x: { c: DeliveryCard; d?: Draft } | undefined, mine = false) => {
      if (!x) {
        return (
          <div key={role} className={s.cmpCol}>
            <div className={s.cmpRole}>{role}</div>
            <div className={s.muted}>{t('ありません', 'None')}</div>
          </div>
        )
      }
      const ids = bulk.allProducts.get(x.c.id) ?? []
      const sameTheme = !mine && !!norm(x.c.theme) && norm(x.c.theme) === norm(me.theme)
      return (
        <div key={role + x.c.id} className={mergeClasses(s.cmpCol, (mine || x.d) && s.cmpColDraft)}>
          <div className={s.cmpRole}>
            {role}
            {x.d && !mine ? ` ・ ${t('下書き', 'Draft')}` : ''}
          </div>
          <div className={s.line}>
            {x.c.channel === CHANNEL_PUSH ? <PhoneRegular /> : <MailRegular />}
            <span className={s.name}>{x.c.name}</span>
          </div>
          <div className={s.muted}>{when(x.c.scheduled_at)}</div>
          <div className={s.value}>
            {x.c.theme}
            {sameTheme && (
              <span className={s.same}>
                {' '}
                <WarningFilled /> {t('テーマが同じ', 'Same theme')}
              </span>
            )}
          </div>
          <FitPreview maxWidth={200} maxHeight={280}>
            <CardPreview card={x.c} productIds={ids} products={products} heroes={heroes} />
          </FitPreview>
          <div>
            {ids.map((pid, i) => {
              const hit = !mine && myIds.has(pid)
              return (
                <div key={`${pid}-${i}`} className={mergeClasses(s.prod, hit && s.prodHit)}>
                  {products.find((p) => p.id === pid)?.name ?? pid}
                  {hit ? ` ・ ${t('重なり', 'Overlap')}` : ''}
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    return (
      <div className={s.compare}>
        {col(t('前の配信(同じチャネル)', 'Previous (same channel)'), prev)}
        {col(t('この下書き', 'This draft'), { c: me, d: sel }, true)}
        {col(t('次の配信(同じチャネル)', 'Next (same channel)'), next)}
        {sameDay.length === 0 ? col(t('同じ日の、他のチャネル', 'Same day, other channel'), undefined) : sameDay.map((x) => col(t('同じ日の、他のチャネル', 'Same day, other channel'), x))}
      </div>
    )
  }

  return (
    <OverlayDrawer open={open} position="end" modalType="non-modal" className={s.drawer} onOpenChange={(_, v) => !v.open && bulk.select(null)}>
      {d && (
        <>
          <DrawerHeader>
            <DrawerHeaderTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={() => bulk.select(null)} />}>
              {d.state === 'done' ? draftCard(d, products).name : t('下書き', 'Draft')}
            </DrawerHeaderTitle>
            <div className={s.head}>
              <span className={s.muted}>{when(d.scheduledAt ? new Date(d.scheduledAt).toISOString() : undefined)}</span>
              <div className={s.tools}>
                <TabList size="small" selectedValue={tab} onTabSelect={(_, v) => setTab(v.value as 'content' | 'compare')}>
                  <Tab value="content">{t('中身', 'Content')}</Tab>
                  <Tab value="compare">{t('比べる', 'Compare')}</Tab>
                </TabList>
                <span className={s.spacer} />
                <Button size="small" icon={<ArrowClockwiseRegular />} disabled={bulk.running || d.state === 'running' || !!bulk.locked(d)} onClick={() => void bulk.generate([d.key])}>
                  {d.state === 'done' ? t('作り直す', 'Recreate') : t('この 1 本を作る', 'Create this one')}
                </Button>
                {d.state === 'done' && (
                  <Button size="small" appearance="primary" icon={<EditRegular />} onClick={() => onEdit(d)}>
                    {t('開いて直す', 'Open & edit')}
                  </Button>
                )}
              </div>
            </div>
          </DrawerHeader>
          <DrawerBody>{tab === 'content' ? contentPane(d) : comparePane(d)}</DrawerBody>
        </>
      )}
    </OverlayDrawer>
  )
}
