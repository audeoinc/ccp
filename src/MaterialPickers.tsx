// 制作で商品・メイン画像を選ぶ小さいポップアップ(ProductPicker・HeroPicker)。
// もとは詳しい制作の画面(2026-11-02 に消した)の中にあったものを、シンプルな制作(ProductionPartEdit)・制作のチャットでも使うので、ここに出した(K4。見た目は前と同じ)
import { useMemo, useState, type ReactNode } from 'react'
import { Button, Popover, PopoverSurface, PopoverTrigger, Spinner, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowLeftRegular, ArrowSwapRegular, ImageAddRegular, LinkRegular } from '@fluentui/react-icons'
import type { Product } from './models/products'
import type { HeroImage, HeroImageMarket } from './models/heroImages'
import { productImage, heroImage } from './images'
import { useT } from './i18n'
import { SearchField } from './SearchField'
import { UrlImagePicker } from './simple/UrlImagePicker'
import { addHeroFromUrl } from './heroFromUrl'
import { useFeature } from './featureFlags'

const useStyles = makeStyles({
  picker: { display: 'grid', rowGap: '6px', width: '340px', maxHeight: '420px' },
  // URL から選ぶときは、ページの画像を並べるので、少し広く・縦に流す
  urlPicker: { display: 'grid', rowGap: '6px', width: '420px', maxHeight: '520px', overflowY: 'auto' },
  pickHead: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
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

/**
 * fromUrl を渡すと「URL から選ぶ」を出す(content.hero.fromurl)。選んだ画像は、写してライブラリに入れてから onPick に渡す
 * (制作は onPick のあとが試す → 確定なので、ライブラリには、選んだ時点で入る)
 */
export function HeroPicker({ heroes, onPick, onUpload, fromUrl }: { heroes: HeroImage[]; onPick: (h: HeroImage) => void; onUpload: () => void; fromUrl?: { market: HeroImageMarket | null; cardId?: string; me: string } }) {
  const s = useStyles()
  const t = useT()
  const [open, setOpen] = useState(false)
  const urlOn = useFeature('content.hero.fromurl') && !!fromUrl
  const [byUrl, setByUrl] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Popover
      open={open}
      onOpenChange={(_, d) => {
        setOpen(d.open)
        if (!d.open) setByUrl(false)
      }}
      withArrow
      positioning="below-end"
    >
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content={t('ほかの画像に替える', 'Replace the image')} relationship="label">
          <Button size="small" appearance="subtle" icon={<ArrowSwapRegular />} />
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface>
        {byUrl && fromUrl ? (
          <div className={s.urlPicker}>
            <span className={s.pickHead}>
              <Button size="small" appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => setByUrl(false)}>
                {t('ライブラリに戻る', 'Back to the library')}
              </Button>
              {busy && <Spinner size="tiny" label={t('ライブラリに入れています', 'Adding to the library')} />}
            </span>
            {error && <span className={s.note}>{error}</span>}
            <UrlImagePicker
              fallbackHint={t('「持っている画像を上げる」からも選べます', 'You can also upload your own image.')}
              caption={t('押すと、その画像をメイン画像のライブラリに入れて、プレビューで試します(確定で入れ替え)', 'Click to add the image to the main image library and try it in the preview (Apply to switch).')}
              onPick={(p) => {
                setBusy(true)
                setError(null)
                addHeroFromUrl({ ...p, ...fromUrl })
                  .then((h) => {
                    onPick(h)
                    setOpen(false)
                    setByUrl(false)
                  })
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                  .finally(() => setBusy(false))
              }}
            />
          </div>
        ) : (
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
          {/* ページか画像の URL から選ぶ(content.hero.fromurl) */}
          {urlOn && (
            <Button size="small" icon={<LinkRegular />} onClick={() => setByUrl(true)}>
              {t('URL から選ぶ', 'Pick from a URL')}
            </Button>
          )}
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
        )}
      </PopoverSurface>
    </Popover>
  )
}
