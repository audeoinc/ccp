import { useRef, useState, type ReactNode } from 'react'
import { Button, Field, Popover, PopoverSurface, Text, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowLeftRegular, ArrowMoveRegular, ArrowSwapRegular, DismissRegular } from '@fluentui/react-icons'
import type { Product } from './models/products'
import { ProductDetail } from './ProductDetail'
import { Row, productMeta } from './ProductRow'
import { AutoTextarea } from './AutoTextarea'
import { productImage } from './images'
import { useT } from './i18n'
import type { DeliveryProductSource as Source } from './models/deliveryProducts'

/** 差し替えに出す候補(中ペインの「残りの候補」と同じもの・同じ順番) */
export interface SwapOption {
  key: string
  product: Product
  reason: string
  source: Source
}

const useStyles = makeStyles({
  anchor: { minWidth: 0 },
  // つかんで動かす帯(プレビューにかぶったとき、ずらして見ながら選べるように。X53)
  grab: { display: 'flex', alignItems: 'center', columnGap: '6px', margin: '-4px -4px 6px', padding: '4px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, cursor: 'move', userSelect: 'none', touchAction: 'none' },
  // 商品の詳しい情報(ProductDetail)と同じ大きさにそろえる(切り替えても、フロートの大きさが変わらないように)
  swap: { width: '420px', maxWidth: '90vw', minHeight: '400px', maxHeight: '80vh', overflowY: 'auto', display: 'grid', rowGap: '10px', padding: '4px', minWidth: 0, alignContent: 'start' },
  swapHead: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  swapTitle: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  caption: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  list: { display: 'grid', rowGap: '6px' },
  foot: { display: 'flex', justifyContent: 'flex-end', columnGap: '8px' },
  open: { display: 'flex', justifyContent: 'flex-start', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
})

interface Props {
  product: Product
  /** フロートを出す向き(右端の商品情報は左へ、中ペインは右へ。プレビューに重ねて出す) */
  position: 'before' | 'after'
  /** 渡したときだけ「ほかの候補から選ぶ」を出す。onSwap は、配信カードの中で入れ替える(保存で確定) */
  swap?: { options: SwapOption[]; onSwap: (candKey: string, reason: string) => void }
  children: ReactNode
}

/**
 * 商品のフロート: 中ペインの「選定済み」の行と、右端の商品情報の行の、どちらから押しても、これを開く(X47)。
 * 中身は、商品の詳しい情報(売上・在庫・MD 方針)と、「ほかの候補から選ぶ」(残りの候補との入れ替え)。
 * 行の中のボタン・入力欄・理由の文(data-no-float)を押したときは開かない(並べ替え・外す・理由の編集を邪魔しないため)
 */
export function ProductFloat({ product, position, swap, children }: Props) {
  const s = useStyles()
  const t = useT()
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'detail' | 'swap'>('detail')
  // つかんで動かした量(閉じたら元の位置に戻す)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const close = () => {
    setOpen(false)
    setView('detail')
    setPos({ x: 0, y: 0 })
  }
  const fromInner = (target: EventTarget) => {
    const el = (target as HTMLElement).closest?.('button, a, input, textarea, select, [data-no-float]')
    return !!el && el !== anchor && !!anchor?.contains(el)
  }
  return (
    <>
      <div
        ref={setAnchor}
        className={s.anchor}
        onClick={(e) => {
          if (fromInner(e.target)) return
          if (open) close()
          else setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) setOpen(true)
        }}
      >
        {children}
      </div>
      <Popover
        open={open}
        positioning={{ target: anchor, position, align: 'top', pinned: true, overflowBoundaryPadding: 8 }}
        // 行そのものを押したときは、上の onClick で開け閉めする(ここで閉じると、すぐに開き直してしまう)
        onOpenChange={(e, d) => {
          if (!d.open && anchor?.contains(e.target as Node)) return
          if (!d.open) close()
        }}
      >
        <PopoverSurface style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
          <div
            className={s.grab}
            title={t('つかんで動かせます', 'Drag to move')}
            onPointerDown={(e) => {
              drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (d) setPos({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy })
            }}
            onPointerUp={() => {
              drag.current = null
            }}
          >
            <ArrowMoveRegular />
            {t('つかんで動かせます', 'Drag to move')}
          </div>
          {view === 'detail' ? (
            <ProductDetail
              product={product}
              onClose={close}
              footer={swap && <SwapOpener count={swap.options.length} onOpen={() => setView('swap')} />}
            />
          ) : (
            swap && (
              <SwapView
                product={product}
                options={swap.options}
                onBack={() => setView('detail')}
                onClose={close}
                onSwap={(key, reason) => {
                  swap.onSwap(key, reason)
                  close()
                }}
              />
            )
          )}
        </PopoverSurface>
      </Popover>
    </>
  )
}

function SwapOpener({ count, onOpen }: { count: number; onOpen: () => void }) {
  const t = useT()
  const s = useStyles()
  return (
    <div className={s.open}>
      <Button size="small" icon={<ArrowSwapRegular />} disabled={count === 0} onClick={onOpen}>
        {t(`ほかの候補から選ぶ(${count}件)`, `Choose another candidate (${count})`)}
      </Button>
    </div>
  )
}

/** 残りの候補から 1 つ選んで、理由(任意)を書いて入れ替える */
function SwapView({ product, options, onBack, onClose, onSwap }: { product: Product; options: SwapOption[]; onBack: () => void; onClose: () => void; onSwap: (key: string, reason: string) => void }) {
  const t = useT()
  const s = useStyles()
  const [picked, setPicked] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  return (
    <div className={s.swap}>
      <div className={s.swapHead}>
        <Button size="small" appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack} aria-label={t('詳しい情報に戻る', 'Back to details')} />
        <Text weight="semibold" size={300} className={s.swapTitle}>{t(`${product.name} の代わりに`, `Instead of ${product.name}`)}</Text>
        <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
      </div>
      <span className={s.caption}>
        {t('AI が案出しで作った、このセクションの残りの候補です。選んで「入れ替える」と、この配信の中で入れ替わります(保存で確定。外した商品は、残りの候補に戻ります)。', 'The remaining candidates the AI suggested for this section. Pick one and press "Swap" to swap it in this delivery (saved when you save; the removed product goes back to the candidates).')}
      </span>
      {options.length === 0 ? (
        <span className={s.caption}>{t('残りの候補はありません。中ペインの「AIで選ぶ」で案を出すと、ここから選べます。', 'No remaining candidates. Use "Select with AI" in the middle pane to get some.')}</span>
      ) : (
        <div className={s.list}>
          {options.map((o) => (
            <Row
              key={o.key}
              image={productImage(o.product)}
              title={o.product.name ?? ''}
              meta={productMeta(o.product)}
              reason={o.reason}
              source={o.source}
              selected={picked === o.key}
              onClick={() => setPicked(o.key)}
            />
          ))}
        </div>
      )}
      <Field label={t('差し替えの理由(任意。配信のメモに残ります)', 'Reason for the swap (optional; kept in the delivery notes)')} size="small">
        <AutoTextarea size="small" value={reason} onChange={(_, d) => setReason(d.value)} />
      </Field>
      <div className={s.foot}>
        <Button size="small" onClick={onBack}>{t('戻る', 'Back')}</Button>
        <Button size="small" appearance="primary" disabled={!picked} onClick={() => picked && onSwap(picked, reason)}>
          {t('入れ替える', 'Swap')}
        </Button>
      </div>
    </div>
  )
}
