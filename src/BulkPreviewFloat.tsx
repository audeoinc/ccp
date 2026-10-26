import { useState, type KeyboardEvent } from 'react'
import { Button, Dialog, DialogBody, DialogTitle, makeStyles, tokens } from '@fluentui/react-components'
import { ChevronLeftRegular, ChevronRightRegular, DesktopRegular, DismissRegular, PhoneRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { ResizableSurface } from './ResizableSurface'
import { CardPreview } from './CardPreview'
import { ChannelBadge } from './ChannelBadge'
import { CHANNEL_PUSH } from './status'
import { useT } from './i18n'
import { loadPref, savePref } from './settings'
import { PREF } from './prefKeys'
import { typo } from './typo'

const useStyles = makeStyles({
  surface: {
    width: 'min(760px, (94vw / var(--ui-zoom, 1)))',
    maxWidth: 'none',
    height: 'calc(90vh / var(--ui-zoom, 1))',
    padding: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  body: { display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1, rowGap: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', rowGap: '6px', flexWrap: 'wrap', padding: '12px 16px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  title: { ...typo.heading, display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0, flexGrow: 1, margin: 0 },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  when: { ...typo.caption, whiteSpace: 'nowrap' },
  count: { ...typo.caption, minWidth: '40px', textAlign: 'center' },
  // 配信カードのプレビューの、スマホ / PC の切り替えと同じ形(cardDetailStyles の deviceSwitch・deviceBtn)
  deviceSwitch: { display: 'inline-flex', columnGap: '2px' },
  deviceBtn: { minWidth: 'auto', height: '24px', padding: '0 8px', fontWeight: tokens.fontWeightRegular },
  scroll: { flexGrow: 1, minHeight: 0, overflowY: 'auto', padding: '16px', backgroundColor: tokens.colorNeutralBackground3, outline: 'none' },
})

/** プレビューで見る 1 本(まだ保存していない案も、そのまま描く) */
export interface BulkPreviewItem {
  key: string
  /** 題に出す日付(と時刻) */
  when: string
  card: DeliveryCard
  productIds: string[]
}

interface Props {
  items: BulkPreviewItem[]
  /** いま見ている 1 本の位置。null なら閉じている */
  index: number | null
  onIndex: (i: number | null) => void
  products: Product[]
  heroes: HeroImage[]
}

/**
 * まとめて作るの ② で、案のメール / アプリのプレビューを大きく見るフロート。
 * 描き方は配信カードと同じ CardPreview(複製しない)。← → で隣の案に移り、続けて見比べる。
 * スマホ / PC は、配信カードのプレビューと同じ設定(PREF.cardPreviewDevice)を使う(画面ごとに覚え分けると、切り替え直すことになるため)
 */
export function BulkPreviewFloat({ items, index, onIndex, products, heroes }: Props) {
  const s = useStyles()
  const t = useT()
  const [device, setDevice] = useState<'mobile' | 'pc'>(() => loadPref<'mobile' | 'pc'>(PREF.cardPreviewDevice, 'mobile'))
  const pickDevice = (d: 'mobile' | 'pc') => {
    setDevice(d)
    savePref(PREF.cardPreviewDevice, d)
  }
  const i = index === null ? -1 : Math.min(index, items.length - 1)
  const item = i >= 0 ? items[i] : undefined
  const move = (d: number) => {
    const n = i + d
    if (n >= 0 && n < items.length) onIndex(n)
  }
  // ← → で隣の案へ(入力欄の中の矢印の操作は、じゃましない。スマホ / PC の切り替えはただのボタンなので、矢印は使わない)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const el = e.target as HTMLElement
    if (el.closest('input, textarea, select, [contenteditable="true"]')) return
    e.preventDefault()
    move(e.key === 'ArrowLeft' ? -1 : 1)
  }
  const isPush = item?.card.channel === CHANNEL_PUSH
  return (
    <Dialog open={!!item} onOpenChange={(_, d) => !d.open && onIndex(null)}>
      <ResizableSurface sizeKey="bulkPreview" className={s.surface} aria-label={t('案のプレビュー', 'Draft preview')} onKeyDown={onKeyDown}>
        {item && (
          <DialogBody className={s.body}>
            <div className={s.head}>
              <DialogTitle as="h2" className={s.title}>
                <ChannelBadge channel={item.card.channel} size="small" />
                <span className={s.when}>{item.when}</span>
                <span className={s.name} title={item.card.name}>
                  {item.card.name}
                </span>
              </DialogTitle>
              {!isPush && (
                <span className={s.deviceSwitch} role="tablist" aria-label={t('プレビューの幅', 'Preview width')}>
                  {(['mobile', 'pc'] as const).map((d) => (
                    <Button key={d} type="button" size="small" role="tab" aria-selected={device === d} appearance={device === d ? 'primary' : 'subtle'} className={s.deviceBtn} icon={d === 'mobile' ? <PhoneRegular /> : <DesktopRegular />} onClick={() => pickDevice(d)}>
                      {d === 'mobile' ? t('スマホ', 'Mobile') : t('PC', 'Desktop')}
                    </Button>
                  ))}
                </span>
              )}
              <Button appearance="subtle" size="small" icon={<ChevronLeftRegular />} disabled={i <= 0} aria-label={t('前の案(←)', 'Previous draft (←)')} title={t('前の案(←)', 'Previous draft (←)')} onClick={() => move(-1)} />
              <span className={s.count}>{`${i + 1} / ${items.length}`}</span>
              <Button appearance="subtle" size="small" icon={<ChevronRightRegular />} disabled={i >= items.length - 1} aria-label={t('次の案(→)', 'Next draft (→)')} title={t('次の案(→)', 'Next draft (→)')} onClick={() => move(1)} />
              <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={() => onIndex(null)} />
            </div>
            {/* 案を移ったら、上から見せる(key で入れ替える) */}
            <div key={item.key} className={s.scroll}>
              <CardPreview card={item.card} productIds={item.productIds} products={products} heroes={heroes} device={device} />
            </div>
          </DialogBody>
        )}
      </ResizableSurface>
    </Dialog>
  )
}
