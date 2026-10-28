// テンプレートを並べて比べるフロート(T10 の「並べて比べる」の部品)。
// 編集中の「似ているテンプレート」の「見比べる」から、今の編集中と相手を左右に並べて開く。のちにテンプレートの一覧から、いくつか選んで並べるのにも使う(並べる数は items の数で決まる)
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Button, Dialog, DialogBody, DialogTitle, makeStyles, tokens } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { ResizableSurface } from './ResizableSurface'
import { TemplateThumb } from './TemplateThumb'
import { LabeledValue } from './LabeledValue'
import { boxCount } from './templateShape'
import { typo } from './typo'
import { useT } from './i18n'
import type { TemplateLayout } from './templates'

const useStyles = makeStyles({
  surface: { width: 'min(980px, calc(94vw / var(--ui-zoom, 1)))', height: 'calc(80vh / var(--ui-zoom, 1))', maxWidth: 'none', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  body: { display: 'flex', flexDirection: 'column', rowGap: 0, flexGrow: 1, minHeight: 0, padding: 0 },
  title: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  titleText: { flexGrow: 1, minWidth: 0 },
  // 列は同じ幅で並べる。見取り図が長いときは、列ごとではなく全体で縦にスクロールする(同じ高さの所を見比べられるように)
  grid: { display: 'grid', columnGap: '16px', padding: '12px 16px 16px', overflowY: 'auto', flexGrow: 1, minHeight: 0, alignItems: 'start' },
  col: { display: 'grid', rowGap: '8px', minWidth: 0, alignContent: 'start' },
  head: { display: 'grid', rowGap: '6px', paddingBottom: '8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  name: { ...typo.valueStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  note: typo.caption,
  facts: { display: 'flex', flexWrap: 'wrap', columnGap: '16px', rowGap: '4px' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
})

export interface CompareItem {
  key: string
  label: string
  layout: TemplateLayout
  /** 名前の下の補足(「編集中」「似ている度 80%」など) */
  note?: string
  /** その列の操作(セクションを取り込む・開くなど。呼ぶ側が決める) */
  actions?: ReactNode
}

interface Props {
  items: CompareItem[]
  onClose: () => void
}

/** テンプレートを左右に並べて比べる。大きさを変えられ、題の行で動かせる(大きさは種類ごとに覚える) */
export function TemplateCompareFloat({ items, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  // 見取り図は幅で大きさを決めるので、列の幅を測って渡す(フロートを広げれば、見取り図も大きくなる)
  const [colW, setColW] = useState(300)
  const obs = useRef<ResizeObserver | null>(null)
  const gridRef = useCallback(
    (el: HTMLDivElement | null) => {
      obs.current?.disconnect()
      obs.current = null
      if (!el) return
      const measure = () => setColW(Math.max(140, Math.floor((el.clientWidth - 32 - 16 * (items.length - 1)) / Math.max(1, items.length))))
      measure()
      obs.current = new ResizeObserver(measure)
      obs.current.observe(el)
    },
    [items.length],
  )
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="templateCompare" min={{ w: 560, h: 360 }} className={s.surface}>
        <DialogBody className={s.body}>
          <div className={s.title}>
            <DialogTitle className={s.titleText}>{t('テンプレートを見比べる', 'Compare templates')}</DialogTitle>
            <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />
          </div>
          <div ref={gridRef} className={s.grid} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
            {items.map((it) => (
              <section key={it.key} className={s.col} aria-label={it.label}>
                <div className={s.head}>
                  <span className={s.name} title={it.label}>
                    {it.label}
                  </span>
                  {it.note && <span className={s.note}>{it.note}</span>}
                  <div className={s.facts}>
                    <LabeledValue label={t('商品の枠', 'Product slots')}>{t(`${boxCount(it.layout)} 点`, `${boxCount(it.layout)}`)}</LabeledValue>
                    <LabeledValue label={t('セクション', 'Sections')}>{it.layout.sections.length}</LabeledValue>
                  </div>
                  {it.actions && <div className={s.actions}>{it.actions}</div>}
                </div>
                {/* 広い列でも 400px まで(全体の並びが一目で見えるように。大きすぎると、セクションの数を見比べるのにスクロールが要る) */}
                <TemplateThumb layout={it.layout} width={Math.min(colW, 400)} />
              </section>
            ))}
          </div>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
