import { useState, type ReactNode } from 'react'
import { Button, DrawerBody, DrawerHeader, DrawerHeaderTitle, OverlayDrawer, Tab, TabList, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkRegular, DismissRegular, EditRegular, MailRegular, PhoneRegular, WarningFilled } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { locale, useT } from './i18n'
import { CardPreview } from './CardPreview'
import { FitPreview } from './FitPreview'
import { MarkdownLite } from './MarkdownLite'
import { CHANNEL_PUSH } from './status'
import { getTemplate } from './templates'
import { themeTypeLabel, type ThemeType } from './themeTypes'
import { dayKeyOf } from './weekLock'
import type { WeekFrames } from './useWeekFrames'

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
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  compare: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', columnGap: '10px', rowGap: '10px', alignItems: 'start' },
  cmpCol: { display: 'grid', rowGap: '6px', padding: '8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  cmpColMine: { border: `1.5px dashed ${tokens.colorBrandStroke1}` },
  cmpRole: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  line: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0 },
  name: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  same: { display: 'inline-flex', alignItems: 'center', columnGap: '3px', color: tokens.colorPaletteDarkOrangeForeground1, fontSize: '12px', fontWeight: tokens.fontWeightSemibold },
  prod: { fontSize: '12px', padding: '1px 4px', borderRadius: tokens.borderRadiusSmall, border: '1px solid transparent' },
  // 重なる商品は、枠で囲む(色だけに頼らない)
  prodHit: { border: `1.5px solid ${tokens.colorPaletteDarkOrangeBorder2}`, fontWeight: tokens.fontWeightSemibold },
})

interface Props {
  frames: WeekFrames
  /** すべての配信(取りやめを除く) */
  cards: DeliveryCard[]
  cardProducts: Map<string, string[]>
  products: Product[]
  heroes: HeroImage[]
  /** 配信カードを開いて直す */
  onOpen: (id: string) => void
}

const timeOf = (iso?: string) => (iso ? new Date(iso).getTime() : 0)
const norm = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ')

/**
 * AI でまとめて作った配信を、確かめる引き出し(W14)。中身(プレビュー・全項目・AI の理由)と、前後の配信との比較を見て、
 * 「確認した」で「AI 下書き・未確認」の印を外す。直すときは、配信カードを開く(保存すると、印は外れる)。
 * 週の表示は、引き出しの左に見えたままにする(並びと見比べられるように)
 */
export function CheckDrawer({ frames, cards, cardProducts, products, heroes, onOpen }: Props) {
  const s = useStyles()
  const t = useT()
  const [tab, setTab] = useState<CheckTab>('content')
  const c = cards.find((x) => x.id === frames.checkId)
  return (
    <OverlayDrawer open={!!c} position="end" modalType="non-modal" className={s.drawer} onOpenChange={(_, v) => !v.open && frames.openCheck(null)}>
      {c && (
        <>
          <DrawerHeader>
            <DrawerHeaderTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={() => frames.openCheck(null)} />}>{c.name}</DrawerHeaderTitle>
            <div className={s.head}>
              <span className={s.muted}>{whenOf(c.scheduled_at)}</span>
              <div className={s.tools}>
                <TabList size="small" selectedValue={tab} onTabSelect={(_, v) => setTab(v.value as CheckTab)}>
                  <Tab value="content">{t('中身', 'Content')}</Tab>
                  <Tab value="compare">{t('比べる', 'Compare')}</Tab>
                </TabList>
                <span className={s.spacer} />
                <Button size="small" icon={<EditRegular />} onClick={() => onOpen(c.id)}>
                  {t('開いて直す', 'Open & edit')}
                </Button>
                {c.ai_unchecked_at && (
                  <Button
                    size="small"
                    appearance="primary"
                    icon={<CheckmarkRegular />}
                    onClick={async () => {
                      await frames.check(c.id)
                      frames.openCheck(null)
                    }}
                  >
                    {t('確認した', 'Checked')}
                  </Button>
                )}
              </div>
            </div>
          </DrawerHeader>
          <DrawerBody>
            <CheckView card={c} tab={tab} cards={cards} cardProducts={cardProducts} products={products} heroes={heroes} />
          </DrawerBody>
        </>
      )}
    </OverlayDrawer>
  )
}

export type CheckTab = 'content' | 'compare'

const whenOf = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '')

/**
 * AI で作った配信の、中身(プレビュー・全項目・AI の理由)か、前後の配信との比較。
 * 週の表示の引き出し(CheckDrawer)と、まとめて作る作業画面の ④(BulkWorkspace)で使う
 */
export function CheckView({ card: c, tab, cards, cardProducts, products, heroes }: { card: DeliveryCard; tab: CheckTab; cards: DeliveryCard[]; cardProducts: Map<string, string[]>; products: Product[]; heroes: HeroImage[] }) {
  const s = useStyles()
  const t = useT()
  const when = whenOf
  const pname = (id: string) => products.find((p) => p.id === id)?.name ?? id

  const fact = (labelText: string, value?: string | null, reason?: string | null, reasonLabel?: string): ReactNode =>
    value ? (
      <div>
        <div className={s.label}>{labelText}</div>
        <div className={s.value}>{value}</div>
        {reason && <div className={s.reason}>{`${reasonLabel ?? t('理由', 'Why')}: ${reason}`}</div>}
      </div>
    ) : null

  const contentPane = (c: DeliveryCard) => {
    const ids = cardProducts.get(c.id) ?? []
    return (
      <div className={s.content}>
        <div className={s.previewBox}>
          <FitPreview maxWidth={280}>
            <CardPreview card={c} productIds={ids} products={products} heroes={heroes} />
          </FitPreview>
        </div>
        <div className={s.facts}>
          {fact(t('種類', 'Type'), c.theme_type ? themeTypeLabel(c.theme_type as ThemeType) : undefined)}
          {fact(t('テーマ', 'Theme'), c.theme, c.theme_reason)}
          {fact(t('テンプレート', 'Template'), c.layout_key ? getTemplate(c.layout_key).label : undefined)}
          {fact(t('メイン画像', 'Hero image'), heroes.find((h) => h.id === c.hero_image_id)?.name, c.hero_reason)}
          {fact(t('ヘッドライン', 'Headline'), c.headline)}
          {fact(t('コピー', 'Copy'), c.copy, c.copy_angle, t('切り口', 'Angle'))}
          {fact(t('見出し', 'Section titles'), c.section_titles?.split('\n').filter(Boolean).join(' / '))}
          {fact(t('商品', 'Products'), ids.map(pname).join('、'))}
          {fact(t('通知のタイトル', 'Notification title'), c.push_title)}
          {fact(t('通知の本文', 'Notification body'), c.push_body)}
          {c.instructions && (
            <div>
              <div className={s.label}>{t('制作指示', 'Production notes')}</div>
              <div className={s.md}>
                <MarkdownLite text={c.instructions} />
              </div>
              {c.instructions_angle && <div className={s.reason}>{`${t('切り口', 'Angle')}: ${c.instructions_angle}`}</div>}
            </div>
          )}
        </div>
      </div>
    )
  }

  const comparePane = (me: DeliveryCard) => {
    const myIds = new Set(cardProducts.get(me.id) ?? [])
    const at = timeOf(me.scheduled_at)
    const others = cards.filter((x) => x.id !== me.id && x.scheduled_at)
    const same = others.filter((x) => x.channel === me.channel).sort((a, b) => timeOf(a.scheduled_at) - timeOf(b.scheduled_at))
    const prev = [...same].reverse().find((x) => timeOf(x.scheduled_at) < at)
    const next = same.find((x) => timeOf(x.scheduled_at) > at)
    const sameDay = me.scheduled_at ? others.filter((x) => x.channel !== me.channel && dayKeyOf(new Date(x.scheduled_at!)) === dayKeyOf(new Date(me.scheduled_at!))) : []
    const col = (role: string, x: DeliveryCard | undefined, mine = false) => {
      if (!x) {
        return (
          <div key={role} className={s.cmpCol}>
            <div className={s.cmpRole}>{role}</div>
            <div className={s.muted}>{t('ありません', 'None')}</div>
          </div>
        )
      }
      const ids = cardProducts.get(x.id) ?? []
      const sameTheme = !mine && !!norm(x.theme) && norm(x.theme) === norm(me.theme)
      return (
        <div key={role + x.id} className={mergeClasses(s.cmpCol, mine && s.cmpColMine)}>
          <div className={s.cmpRole}>{role}</div>
          <div className={s.line}>
            {x.channel === CHANNEL_PUSH ? <PhoneRegular /> : <MailRegular />}
            <span className={s.name}>{x.name}</span>
          </div>
          <div className={s.muted}>{when(x.scheduled_at)}</div>
          <div className={s.value}>
            {x.theme}
            {sameTheme && (
              <span className={s.same}>
                {' '}
                <WarningFilled /> {t('テーマが同じ', 'Same theme')}
              </span>
            )}
          </div>
          <FitPreview maxWidth={200} maxHeight={280}>
            <CardPreview card={x} productIds={ids} products={products} heroes={heroes} />
          </FitPreview>
          <div>
            {ids.map((pid, i) => {
              const hit = !mine && myIds.has(pid)
              return (
                <div key={`${pid}-${i}`} className={mergeClasses(s.prod, hit && s.prodHit)}>
                  {pname(pid)}
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
        {col(t('この配信', 'This delivery'), me, true)}
        {col(t('次の配信(同じチャネル)', 'Next (same channel)'), next)}
        {sameDay.length === 0 ? col(t('同じ日の、他のチャネル', 'Same day, other channel'), undefined) : sameDay.map((x) => col(t('同じ日の、他のチャネル', 'Same day, other channel'), x))}
      </div>
    )
  }

  return tab === 'content' ? contentPane(c) : comparePane(c)
}
