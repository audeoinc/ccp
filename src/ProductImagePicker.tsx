import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, MessageBar, MessageBarBody, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ResizableSurface } from './ResizableSurface'
import { ArrowDownloadRegular, DismissRegular, DocumentArrowUpRegular, OpenRegular } from '@fluentui/react-icons'
import { ProductPages, type ImageAngle, type ImagePick, type PageImage } from './data/productPages'
import { ProductImagesService } from './data/productImages'
import { appPath } from './appRoot'
import { productUrl } from './links'
import { productImage } from './images'
import { getLang, optionLabel, useT } from './i18n'
import type { Product } from './models/products'
import { AiIcon } from './AiMark'

// この配信で使う商品の画像を、商品ページから選ぶ(X64)。
// 商品ページを読んで画像を並べ、AI がアングルを見分けて、この配信で伝えたいことに合う画像を勧める。
// ページを読めない(外に出られない環境・読ませないサイト)ときのために、画像を貼り付ける・ファイルを上げる・画像の URL を入れる、でも選べる

const useStyles = makeStyles({
  surface: { width: 'min(1080px, (96vw / var(--ui-zoom, 1)))', maxWidth: 'none', maxHeight: 'calc(90vh / var(--ui-zoom, 1))' },
  content: { display: 'grid', rowGap: '12px', minHeight: 0 },
  // 左の列は上に詰める(画像が少ないときに、行の間が広がらないように)
  left: { display: 'grid', rowGap: '8px', alignContent: 'start', minHeight: 0 },
  urlRow: { display: 'flex', alignItems: 'flex-end', columnGap: '8px', flexWrap: 'wrap', rowGap: '6px' },
  urlField: { flexGrow: 1, minWidth: '280px' },
  cols: { display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', columnGap: '16px', minHeight: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', alignContent: 'start', maxHeight: 'calc(56vh / var(--ui-zoom, 1))', overflowY: 'auto', padding: '2px' },
  tile: { display: 'grid', rowGap: '4px', padding: '6px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  tileOn: { outline: `2px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  // 画像は切らずに全体を見せる
  thumb: { width: '100%', aspectRatio: '4 / 5', objectFit: 'contain', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusSmall },
  marks: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  side: { display: 'grid', rowGap: '10px', alignContent: 'start' },
  big: { width: '100%', maxHeight: 'calc(40vh / var(--ui-zoom, 1))', objectFit: 'contain', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium },
  head: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  value: { fontSize: tokens.fontSizeBase200 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  reason: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  drop: { display: 'grid', rowGap: '8px', padding: '10px 12px', border: `1px dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium },
  dropOn: { backgroundColor: tokens.colorBrandBackground2, border: `1px dashed ${tokens.colorBrandStroke1}` },
  dropRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '8px', rowGap: '6px' },
  empty: { display: 'grid', placeItems: 'center', minHeight: '160px', color: tokens.colorNeutralForeground3, border: `1px dashed ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, textAlign: 'center', padding: '12px' },
})

/** 配信で伝えたいこと(AI に渡す。配信カードで書き換え中の値) */
export interface DeliveryGist {
  theme?: string
  headline?: string
  copy?: string
  themeType?: string
}

interface Props {
  product: Product
  /** いまこの配信で使っている画像(空 = 商品のマスタの画像) */
  current?: string
  delivery: DeliveryGist
  /** 決めた画像(source = どこから持ってきたか) */
  onPick: (url: string, source: string) => void
  onClose: () => void
}

/** 選んでいる画像: ページの画像(番号)か、手で入れた画像(貼り付け・ファイル・URL) */
type Chosen = { kind: 'page'; index: number } | { kind: 'own'; url: string; source: string }

const pageUrlOf = (p: Product) => productUrl(p)

export function ProductImagePicker({ product, current, delivery, onPick, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  const [url, setUrl] = useState(() => pageUrlOf(product))
  const [loading, setLoading] = useState(false)
  // stored = 取り込んだ商品の画像(表 product_images。B11)。ページを読まずに、それを候補に並べる
  const [page, setPage] = useState<{ sample: boolean; page: string; images: PageImage[]; stored?: boolean } | null>(null)
  const [stored, setStored] = useState<PageImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [angles, setAngles] = useState<ImageAngle[]>([])
  const [picks, setPicks] = useState<ImagePick[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [own, setOwn] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const read = async (target: string) => {
    if (!target.trim()) return
    setLoading(true)
    setError(null)
    setPage(null)
    setAngles([])
    setPicks(null)
    setChosen((c) => (c?.kind === 'page' ? null : c))
    try {
      const r = await ProductPages.images(target.trim())
      setPage(r)
      if (r.images.length === 0) setError(t('このページから、商品の画像を見つけられませんでした。画像をコピーして貼る・ファイルを上げる、で選べます', 'No product images were found on this page. You can paste an image or upload a file instead.'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }
  /** 取り込んだ画像を、候補に並べる(ページを読まない) */
  const showStored = (imgs: PageImage[]) => {
    setError(null)
    setAngles([])
    setPicks(null)
    setChosen((c) => (c?.kind === 'page' ? null : c))
    setPage({ sample: false, page: '', images: imgs, stored: true })
  }
  // 開いたら: 取り込んだ商品の画像があれば、それを並べる(Workbench は EC サイトを読めないため)。なければ、商品の URL のページを読む
  useEffect(() => {
    void (async () => {
      const r = await ProductImagesService.getAll({ filter: `product_id eq '${product.id}'`, orderBy: ['sort_order'] })
      // master = 見本で置き換える前のメイン画像の控え(元に戻すため。候補には出さない)
      const rows = (r.success ? r.data ?? [] : []).filter((x) => x.image_url && x.source !== 'master')
      // 本物の画像(B11 で取り込んだ)があれば、AI で作った見本の写真(source = sample)は使わない
      const real = rows.filter((x) => !x.source)
      const imgs = (real.length ? real : rows).map((x) => ({
        src: x.image_url as string,
        // 見本の写真の説明の文も、AI の判断の材料に渡す
        alt: x.caption ? `${x.alt ?? ''}: ${x.caption}` : x.alt ?? '',
        main: x.is_main === 1,
      }))
      if (imgs.length) {
        setStored(imgs)
        showStored(imgs)
      } else await read(url)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const askAi = async () => {
    if (!page?.images.length) return
    setAsking(true)
    setError(null)
    try {
      const r = await ProductPages.suggest({
        images: page.images,
        product: { name: product.name, description: product.description ?? '', category: product.category_name ? optionLabel(product.category_name) : '' },
        delivery: { theme: delivery.theme ?? '', headline: delivery.headline ?? '', copy: delivery.copy ?? '', type: delivery.themeType ?? '' },
        language: getLang() === 'en' ? 'en' : 'ja',
      })
      setAngles(r.images)
      setPicks(r.picks)
      if (r.picks[0]) setChosen({ kind: 'page', index: r.picks[0].index })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAsking(false)
    }
  }

  // 貼り付け・落としたファイル・選んだファイルを置いて、手で入れた画像にする
  const takeFile = async (file: File | undefined, source: string) => {
    if (!file) return
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setError(t('使えるのは JPEG・PNG・WebP・GIF の画像です', 'Only JPEG, PNG, WebP or GIF images can be used'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const stored = await ProductPages.upload(file.name ? file : new File([file], 'pasted.png', { type: file.type }))
      setChosen({ kind: 'own', url: stored, source })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const onPaste = (e: React.ClipboardEvent) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    if (file) {
      e.preventDefault()
      void takeFile(file, t('貼り付けた画像', 'Pasted image'))
    }
  }

  const angleName = (a?: string) =>
    ({
      front: t('正面', 'Front'),
      back: t('後ろ', 'Back'),
      side: t('横', 'Side'),
      worn: t('着用', 'Worn'),
      detail: t('ディテール', 'Detail'),
      texture: t('素材の寄り', 'Texture'),
      scene: t('使う場面', 'Scene'),
      flat: t('平置き', 'Flat lay'),
      package: t('箱・付属品', 'Package'),
      other: t('その他', 'Other'),
    })[a ?? ''] ?? a ?? ''
  const angleOf = (i: number) => angles.find((x) => x.index === i)
  const rankOf = (i: number) => (picks ?? []).findIndex((x) => x.index === i)
  const shownSrc = (src: string) => appPath(src)

  const chosenSrc = chosen?.kind === 'page' ? page?.images[chosen.index]?.src : chosen?.kind === 'own' ? chosen.url : undefined
  const confirm = async () => {
    if (!chosen) return
    // 上げたファイル(素材の置き場所に置いたもの)は、そのまま使う
    if (chosen.kind === 'own' && !/^https?:\/\//.test(chosen.url)) {
      onPick(chosen.url, chosen.source)
      return
    }
    const src = chosen.kind === 'own' ? chosen.url : page?.images[chosen.index]?.src
    if (!src) return
    const source = chosen.kind === 'own' ? chosen.source : page?.stored ? t('取り込んだ画像', 'Imported image') : url.trim()
    setBusy(true)
    setError(null)
    try {
      const r = await ProductPages.adopt(src)
      onPick(r.image_url, source)
    } catch {
      // 写せない(外に出られない など)ときは、画像の URL のまま使う(ブラウザからは見えるため)。あとで消えることがある
      onPick(src, source)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="productImages" className={s.surface} onPaste={onPaste}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />}>
            {t(`この配信で使う画像 — ${product.name}`, `Image for this delivery — ${product.name}`)}
          </DialogTitle>
          <DialogContent className={s.content}>
            <div className={s.urlRow}>
              <Field label={t('商品ページの URL', 'Product page URL')} size="small" className={s.urlField}>
                <Input size="small" value={url} onChange={(_, d) => setUrl(d.value)} onKeyDown={(e) => e.key === 'Enter' && void read(url)} />
              </Field>
              <Button size="small" icon={<ArrowDownloadRegular />} disabled={loading || !url.trim()} onClick={() => void read(url)}>
                {t('ページを読む', 'Read the page')}
              </Button>
              {stored.length > 0 && !page?.stored && (
                <Button size="small" appearance="subtle" onClick={() => showStored(stored)}>
                  {t(`取り込んだ画像に戻す(${stored.length})`, `Back to imported images (${stored.length})`)}
                </Button>
              )}
              {page && !page.stored && (
                <Button size="small" appearance="subtle" icon={<OpenRegular />} as="a" href={page.sample ? ProductPages.pageUrl(page.page) : page.page} target="_blank" rel="noreferrer">
                  {t('ページを開く', 'Open the page')}
                </Button>
              )}
              {page?.stored && (
                <Badge appearance="tint" color="success" title={t('商品ページから集めて取り込んだ画像です(メインを含む)。ページを読み直すときは「ページを読む」', 'Images collected from the product page and imported (incl. the main image). Use “Read the page” to read it again.')}>
                  {t('取り込んだ画像', 'Imported images')}
                </Badge>
              )}
              {page?.sample && (
                <Badge appearance="tint" color="informative" title={t('本物の EC サイトの代わりに、CCP が作った見本のページです(外に出られない環境でも試せるように)', 'A sample page made by CCP in place of the real shop (so it works without outside access)')}>
                  {t('見本のページ', 'Sample page')}
                </Badge>
              )}
            </div>

            {error && (
              <MessageBar intent="warning" layout="multiline">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            <div className={s.cols}>
              <div className={s.left}>
                <div className={s.urlRow}>
                  <span className={s.head}>{page?.stored
                    ? t(`取り込んだ画像(${page.images.length})`, `Imported images (${page.images.length})`)
                    : t(`ページの画像${page ? `(${page.images.length})` : ''}`, `Images on the page${page ? ` (${page.images.length})` : ''}`)}</span>
                  <Button size="small" appearance="primary" icon={<AiIcon tone="white" size={14} />} disabled={!page?.images.length || asking} onClick={() => void askAi()}>
                    {picks ? t('AI にもう一度選んでもらう', 'Ask AI again') : t('AI に選んでもらう', 'Ask AI to choose')}
                  </Button>
                  {asking && <Spinner size="tiny" label={t('AI が画像を見ています', 'AI is looking at the images')} />}
                </div>
                <span className={s.caption}>{t('AI は、画像ごとのアングル(正面・着用・ディテール など)を見分け、配信のテーマ・見出し・コピーと商品の説明から、伝えたいことが見て分かる画像を勧めます', 'AI tells the angle of each image (front, worn, detail…) and recommends the ones that show what this delivery wants to say, from its theme, headline and copy.')}</span>
                {loading ? (
                  <Spinner size="small" label={t('ページを読んでいます', 'Reading the page')} />
                ) : page && page.images.length > 0 ? (
                  <div className={s.grid}>
                    {page.images.map((img, i) => {
                      const a = angleOf(i)
                      const rank = rankOf(i)
                      return (
                        <button key={img.src} type="button" className={mergeClasses(s.tile, chosen?.kind === 'page' && chosen.index === i && s.tileOn)} onClick={() => setChosen({ kind: 'page', index: i })}>
                          <img className={s.thumb} src={shownSrc(img.src)} alt={img.alt} draggable={false} />
                          <span className={s.marks}>
                            {img.main && (
                              <Badge size="small" appearance="filled" color="informative">
                                {t('メイン', 'Main')}
                              </Badge>
                            )}
                            {rank >= 0 && (
                              <Badge size="small" appearance="filled" color="brand">
                                {t(`AI のおすすめ ${rank + 1}`, `AI pick ${rank + 1}`)}
                              </Badge>
                            )}
                            {a && (
                              <Badge size="small" appearance="tint" color="informative">
                                {angleName(a.angle)}
                              </Badge>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className={s.empty}>{t('ページの画像がありません。右の「ほかの画像を使う」からも選べます', 'No images from the page. You can also use another image on the right.')}</div>
                )}
              </div>

              <div className={s.side}>
                <span className={s.head}>{t('選んでいる画像', 'Selected image')}</span>
                {chosenSrc ? <img className={s.big} src={shownSrc(chosenSrc)} alt="" draggable={false} /> : <div className={s.empty}>{t('左の画像を押すか、下から画像を入れてください', 'Click an image on the left, or add one below')}</div>}
                {chosen?.kind === 'page' && (() => {
                  const a = angleOf(chosen.index)
                  const pick = picks?.find((x) => x.index === chosen.index)
                  return (
                    <>
                      {a && (
                        <span className={s.value}>
                          <span className={s.label}>{t('アングル ', 'Angle ')}</span>
                          {angleName(a.angle)}
                          {a.note ? ` — ${a.note}` : ''}
                        </span>
                      )}
                      {pick && <span className={s.reason}>{t(`AI の理由: ${pick.reason}`, `Why AI picked it: ${pick.reason}`)}</span>}
                    </>
                  )
                })()}
                {chosen?.kind === 'own' && <span className={s.caption}>{chosen.source}</span>}
                <div className={s.urlRow}>
                  <span className={s.label}>{t('いまの画像', 'Current image')}</span>
                  <img src={productImage(product, current)} alt="" style={{ width: 40, height: 50, objectFit: 'contain' }} draggable={false} />
                  <span className={s.caption}>{current ? t('この配信で選んだ画像', 'Chosen for this delivery') : t('商品のマスタの画像', 'From the product master')}</span>
                </div>

                <div
                  className={mergeClasses(s.drop, over && s.dropOn)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOver(true)
                  }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setOver(false)
                    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
                    if (file) return void takeFile(file, file.name)
                    // ほかのタブの画像を落としたときは、画像の URL が来る
                    const dropped = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')).split('\n')[0]?.trim()
                    if (dropped && /^https?:\/\//.test(dropped)) setChosen({ kind: 'own', url: dropped, source: dropped })
                  }}
                >
                  <span className={s.head}>{t('ほかの画像を使う', 'Use another image')}</span>
                  <span className={s.caption}>
                    {t('商品ページの画像を右クリック →「画像をコピー」して、ここで Ctrl+V。ファイルを落とす・選ぶ、画像の URL を入れる、でも使えます', 'Right-click an image on the product page → "Copy image", then press Ctrl+V here. You can also drop or choose a file, or enter an image URL.')}
                  </span>
                  <div className={s.dropRow}>
                    <Button size="small" icon={<DocumentArrowUpRegular />} disabled={busy} onClick={() => fileRef.current?.click()}>
                      {t('ファイルを選ぶ', 'Choose a file')}
                    </Button>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => void takeFile(e.target.files?.[0], e.target.files?.[0]?.name ?? '')} />
                  </div>
                  <div className={s.dropRow}>
                    <Input size="small" style={{ flexGrow: 1, minWidth: 160 }} placeholder={t('画像の URL(https://…)', 'Image URL (https://…)')} value={own} onChange={(_, d) => setOwn(d.value)} />
                    <Button size="small" disabled={!/^https?:\/\/\S+$/.test(own.trim())} onClick={() => setChosen({ kind: 'own', url: own.trim(), source: own.trim() })}>
                      {t('この URL を使う', 'Use this URL')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            {current && (
              <Button appearance="subtle" onClick={() => onPick('', '')}>
                {t('商品のマスタの画像に戻す', 'Back to the product master image')}
              </Button>
            )}
            <Button onClick={onClose}>{t('やめる', 'Cancel')}</Button>
            <Button appearance="primary" disabled={!chosen || busy} onClick={() => void confirm()}>
              {busy ? t('写しています…', 'Copying…') : t('この画像にする', 'Use this image')}
            </Button>
          </DialogActions>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
