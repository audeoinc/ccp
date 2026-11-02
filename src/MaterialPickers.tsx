// 制作で商品・メイン画像を選ぶ小さいポップアップ(ProductPicker・HeroPicker)。
// もとは詳しい制作の画面(2026-11-02 に消した)の中にあったものを、シンプルな制作(ProductionPartEdit)・制作のチャットでも使うので、ここに出した(K4。見た目は前と同じ)
import { useMemo, useState, type ReactNode } from 'react'
import { Button, Popover, PopoverSurface, PopoverTrigger, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowSwapRegular, ImageAddRegular } from '@fluentui/react-icons'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { productImage, heroImage } from './images'
import { useT } from './i18n'
import { SearchField } from './SearchField'

const useStyles = makeStyles({
  picker: { display: 'grid', rowGap: '6px', width: '340px', maxHeight: '420px' },
  pickList: { overflowY: 'auto', display: 'grid', rowGap: '2px', minHeight: 0 },
  pickItem: { display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr)', columnGap: '8px', alignItems: 'center', padding: '4px', border: 'none', borderRadius: tokens.borderRadiusMedium, backgroundColor: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: tokens.fontSizeBase200, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  pickThumb: { width: '36px', height: '36px', objectFit: 'contain', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusSmall },
  heroGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', overflowY: 'auto', minHeight: 0 },
  heroPick: { padding: 0, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3, cursor: 'pointer', height: '64px', ':hover': { border: `1px solid ${tokens.colorBrandStroke1}` } },
  heroPickImg: { width: '100%', height: '100%', objectFit: 'contain' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

export function ProductPicker({ trigger, products, onPick }: { trigger: ReactNode; products: Product[]; onPick: (id: string) => void }) {
  const s = useStyles()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const matched = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? products.filter((p) => p.name.toLowerCase().includes(k) || (p.product_code ?? '').toLowerCase().includes(k)) : products
  }, [products, q])
  const hits = matched.slice(0, 40)
  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} withArrow positioning="below-end">
      <PopoverTrigger disableButtonEnhancement>{trigger as never}</PopoverTrigger>
      <PopoverSurface>
        <div className={s.picker}>
          <SearchField value={q} onChange={setQ} placeholder={t('商品名・商品コードで探す', 'Search by name or code')} count={matched.length} autoFocus />
          <div className={s.pickList}>
            {hits.map((p) => (
              <button
                key={p.id}
                type="button"
                className={s.pickItem}
                onClick={() => {
                  onPick(p.id)
                  setOpen(false)
                }}
              >
                <img className={s.pickThumb} src={productImage(p) ?? ''} alt="" />
                <span>
                  {p.name}
                  <span className={s.note}>{` ・ ${p.product_code ?? ''}`}</span>
                </span>
              </button>
            ))}
            {!hits.length && <span className={s.note}>{t('見つかりません', 'No matches')}</span>}
          </div>
        </div>
      </PopoverSurface>
    </Popover>
  )
}

export function HeroPicker({ heroes, onPick, onUpload }: { heroes: HeroImage[]; onPick: (h: HeroImage) => void; onUpload: () => void }) {
  const s = useStyles()
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} withArrow positioning="below-end">
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content={t('ほかの画像に替える', 'Replace the image')} relationship="label">
          <Button size="small" appearance="subtle" icon={<ArrowSwapRegular />} />
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface>
        <div className={s.picker}>
          {/* 持っている画像を上げて替える(X59。ライブラリにも入る) */}
          <Button
            size="small"
            icon={<ImageAddRegular />}
            onClick={() => {
              setOpen(false)
              onUpload()
            }}
          >
            {t('持っている画像を上げる', 'Upload your own image')}
          </Button>
          <div className={s.heroGrid}>
            {heroes.map((h) => (
              <button
                key={h.id}
                type="button"
                className={s.heroPick}
                title={h.name}
                onClick={() => {
                  onPick(h)
                  setOpen(false)
                }}
              >
                <img className={s.heroPickImg} src={heroImage(h) ?? ''} alt={h.name} />
              </button>
            ))}
          </div>
        </div>
      </PopoverSurface>
    </Popover>
  )
}
