// 商品の「画像を替える」(2026-10-30 利用者。メイン画像の「入れ替える」と同じ形)。部品のペインの商品の箱の真下に「商品を入れ替える」と並べて置き、
// そこから引き出す枠の中に、その商品のページの画像を並べる。押すとプレビューの枠にだけ仮に写し、「確定」で入る(試す → 確定。確定で閉じる)。
// 以前の、商品のフロート →「商品ページから画像を選ぶ…」→ 別の窓、の遠回りをやめた(X64 の画像の選び方の中身は、ここへ移した)。
// AB テストで商品が全案で共通のときは、いま開いている案の画像だけを替える(CardDetail の setItemImage)。X80 の「詳しく」の枠の写真も、ここから替える
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Field, Input, MessageBar, MessageBarBody, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowDownloadRegular, ArrowUndoRegular, ArrowUploadRegular, DocumentArrowUpRegular, ImageEditRegular, ImageMultipleRegular, OpenRegular } from '@fluentui/react-icons'
import { ChooseDrawer } from '../ChoosePanel'
import { TrialBar } from '../TrialBar'
import { useTrial } from '../trial'
import { ProductPages, type ImageAngle, type ImagePick, type PageImage } from '../data/productPages'
import { ProductImagesService } from '../data/productImages'
import { AiRunsService, type AiRunAdoption } from '../data/aiRuns'
import { appPath } from '../appRoot'
import { productUrl } from '../links'
import { getLang, optionLabel, useT } from '../i18n'
import { AiIcon } from '../AiMark'
import type { SimpleEditor } from './editor'
import { useFeature } from '../featureFlags'
import { FeatureBadge } from '../FeatureBadge'

/** AI の依頼の記録(ai_runs)の種類。画像の案は学びを使わないので、結果の面の「学びあり / なし」の比べには入れない(src/impact.ts) */
export const IMAGE_SUGGEST_TASK = 'suggest_product_image'

const useStyles = makeStyles({
  body: { display: 'grid', rowGap: '8px' },
  row: { display: 'flex', alignItems: 'flex-end', columnGap: '8px', flexWrap: 'wrap', rowGap: '6px' },
  grow: { flexGrow: 1, minWidth: '180px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: '8px', alignContent: 'start', padding: '2px' },
  tile: { display: 'grid', rowGap: '4px', padding: '4px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  tileOn: { outline: `2px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  // 画像は切らずに全体を見せる
  thumb: { width: '100%', aspectRatio: '4 / 5', objectFit: 'contain', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusSmall },
  marks: { display: 'flex', flexWrap: 'wrap', gap: '3px' },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  reason: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  drop: { display: 'grid', rowGap: '8px', padding: '10px 12px', border: `1px dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium },
  dropOn: { backgroundColor: tokens.colorBrandBackground2, border: `1px dashed ${tokens.colorBrandStroke1}` },
  empty: { display: 'grid', placeItems: 'center', minHeight: '80px', color: tokens.colorNeutralForeground3, border: `1px dashed ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, textAlign: 'center', padding: '12px' },
})

type Tab = 'page' | 'own'

/**
 * itemKey の枠の商品の画像を替える。open / onOpenChange は、ほかの引き出し(商品を入れ替える)と同時に開かないように、呼ぶ側が持つ。
 * hideTrigger なら、開くボタンを出さず、開いているときの枠だけ(ボタンは「商品を入れ替える」の隣に、呼ぶ側が置く)
 */
export function ProductImageSwap({ editor: e, itemKey, open, onOpenChange, hideTrigger = false }: { editor: SimpleEditor; itemKey: string; open: boolean; onOpenChange: (open: boolean) => void; hideTrigger?: boolean }) {
  const s = useStyles()
  const t = useT()
  const item = e.items.find((i) => i.key === itemKey)
  const product = e.products.find((p) => p.id === item?.productId)
  const current = item?.imageUrl
  // B・C 案を開いていて、画像だけ案ごと(商品は全案で共通)のとき(X64 の e)
  const variant = e.ab && e.ab.active !== 'A' ? e.ab.active : undefined
  const trial = useTrial()
  // 版に従って止める(X87): AI のおすすめ(ai.pageimage)と、商品ページの URL を読んで画像を拾うこと(content.products.pagefetch)。
  // 取り込んだ画像(product_images)は、どちらを止めても並べる(すでにあるデータは隠さない)
  const aiOn = useFeature('ai.pageimage')
  const fetchOn = useFeature('content.products.pagefetch')

  const [url, setUrl] = useState(() => (product ? productUrl(product) : ''))
  const [loading, setLoading] = useState(false)
  // stored = 取り込んだ商品の画像(表 product_images。B11)。ページを読まずに、それを候補に並べる
  const [page, setPage] = useState<{ sample: boolean; page: string; images: PageImage[]; stored?: boolean } | null>(null)
  const [stored, setStored] = useState<PageImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [angles, setAngles] = useState<ImageAngle[]>([])
  const [picks, setPicks] = useState<ImagePick[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [own, setOwn] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // いまの AI の案の記録(ai_runs の id)。確定したときに、案から選んだか(as_is)・ほかを選んだか(rejected)を書く(X64 の f)
  const runRef = useRef<string | null>(null)
  const settleRun = (adoption: AiRunAdoption) => {
    const id = runRef.current
    runRef.current = null
    if (id) AiRunsService.update(id, { adoption }).catch(() => undefined)
  }

  const read = async (target: string) => {
    if (!target.trim()) return
    setLoading(true)
    setError(null)
    setPage(null)
    setAngles([])
    setPicks(null)
    try {
      const r = await ProductPages.images(target.trim())
      setPage(r)
      if (r.images.length === 0) setError(t('このページから、商品の画像を見つけられませんでした。「ほかの画像」のタブで、貼り付け・ファイル・URL からも選べます', 'No product images were found on this page. Use the Other image tab to paste, upload or enter a URL.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }
  /** 取り込んだ画像を、候補に並べる(ページを読まない) */
  const showStored = (imgs: PageImage[]) => {
    setError(null)
    setAngles([])
    setPicks(null)
    setPage({ sample: false, page: '', images: imgs, stored: true })
  }
  // 初めて開いたら: 取り込んだ商品の画像があれば、それを並べる(Workbench は EC サイトを読めないため)。なければ、商品の URL のページを読む
  const started = useRef(false)
  useEffect(() => {
    if (!open || !product || started.current) return
    started.current = true
    void (async () => {
      const r = await ProductImagesService.getAll({ filter: `product_id eq '${product.id}'`, orderBy: ['sort_order'] })
      // master = 見本で置き換える前のメイン画像の控え(元に戻すため。候補には出さない)
      const rows = (r.success ? (r.data ?? []) : []).filter((x) => x.image_url && x.source !== 'master')
      // 本物の画像(B11 で取り込んだ)があれば、AI で作った見本の写真(source = sample)は使わない
      const real = rows.filter((x) => !x.source)
      const imgs = (real.length ? real : rows).map((x) => ({
        src: x.image_url as string,
        // 見本の写真の説明の文も、AI の判断の材料に渡す
        alt: x.caption ? `${x.alt ?? ''}: ${x.caption}` : (x.alt ?? ''),
        main: x.is_main === 1,
        model_usable_until: x.model_usable_until?.slice(0, 10) || undefined,
      }))
      if (imgs.length) {
        setStored(imgs)
        showStored(imgs)
      } else if (fetchOn) await read(url)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id])

  const askAi = async () => {
    if (!page?.images.length || !product) return
    setAsking(true)
    setError(null)
    try {
      const r = await ProductPages.suggest({
        images: page.images,
        product: { name: product.name, description: product.description ?? '', category: product.category_name ? optionLabel(product.category_name) : '' },
        delivery: { theme: e.form.theme, headline: e.form.headline, copy: e.form.copy, type: e.form.themeType },
        language: getLang() === 'en' ? 'en' : 'ja',
      })
      setAngles(r.images)
      setPicks(r.picks)
      // AI の案を頼んだことを残す(記録に失敗しても、案は使える。案そのものは保存しない)
      runRef.current = null
      if (!e.unsaved && e.card.id)
        void AiRunsService.create({ delivery_card_id: e.card.id, task: IMAGE_SUGGEST_TASK, learning_ids: '[]' })
          .then((x) => {
            if (x.success && x.data?.id) runRef.current = x.data.id
          })
          .catch(() => undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAsking(false)
    }
  }

  /**
   * 確定: ページの画像は、素材の置き場所に写してから使う(EC サイトの画像の URL は、あとで消えることがあるため)。
   * ページの画像にモデルの使用期限があれば、写した画像を商品の画像の表に残す(配信日より前に切れるときのアラートが、この画像を見つけられるように。X77)
   */
  const adoptAndSet = async (src: string, source: string, img?: PageImage) => {
    if (!product) return
    setBusy(true)
    setError(null)
    try {
      if (!/^https?:\/\//.test(src)) {
        e.setItemImage(itemKey, src, source)
        return
      }
      const r = await ProductPages.adopt(src)
      if (img?.model_usable_until && r.copied) {
        await ProductImagesService.create({
          name: img.alt || product.name,
          product_id: product.id,
          product_code: product.product_code,
          market: product.market,
          image_url: r.image_url,
          source_url: src,
          alt: img.alt || undefined,
          caption: img.description || undefined,
          model_usable_until: img.model_usable_until,
        }).catch(() => undefined)
      }
      e.setItemImage(itemKey, r.image_url, source)
    } catch {
      // 写せない(外に出られない など)ときは、画像の URL のまま使う(ブラウザからは見えるため)。あとで消えることがある
      e.setItemImage(itemKey, src, source)
    } finally {
      setBusy(false)
    }
  }
  /** 試す: プレビューの枠にだけ仮に写す。確定で、写して入れる(確定したら引き出しを閉じる) */
  const tryImage = (src: string, name: string, source: string, img?: PageImage, pageIndex?: number) =>
    trial.tryIt({
      key: src,
      from: current ? t('いまの画像', 'Current image') : t('商品のマスタの画像', 'Product master image'),
      to: name || t('選んだ画像', 'Chosen image'),
      preview: () => item && e.setAiPreview({ item: { key: itemKey, productId: item.productId, imageUrl: appPath(src) } }),
      unpreview: () => e.setAiPreview(null),
      apply: () => {
        e.setAiPreview(null)
        // AI のおすすめ(1〜3 位のどれか)を選んだら「そのまま採用」、ほかの画像なら「使わなかった」
        settleRun(pageIndex !== undefined && picks?.some((x) => x.index === pageIndex) ? 'as_is' : 'rejected')
        void adoptAndSet(src, source, img)
        onOpenChange(false)
      },
    })

  // 貼り付け・落としたファイル・選んだファイルを置いて、手で入れた画像として試す
  const takeFile = async (file: File | undefined, source: string) => {
    if (!file) return
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setError(t('使えるのは JPEG・PNG・WebP・GIF の画像です', 'Only JPEG, PNG, WebP or GIF images can be used'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const up = await ProductPages.upload(file.name ? file : new File([file], 'pasted.png', { type: file.type }))
      tryImage(up, source, source)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
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

  if (!item || !product) return null
  const pageTab = (
    <div className={s.body}>
      {fetchOn && (
        <div className={s.row}>
          <Field label={t('商品ページの URL', 'Product page URL')} size="small" className={s.grow}>
            <Input size="small" value={url} onChange={(_, d) => setUrl(d.value)} onKeyDown={(ev) => ev.key === 'Enter' && void read(url)} />
          </Field>
          <Button size="small" icon={<ArrowDownloadRegular />} disabled={loading || !url.trim()} onClick={() => void read(url)}>
            {t('ページを読む', 'Read the page')}
          </Button>
          <FeatureBadge id="content.products.pagefetch" />
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
        </div>
      )}
      <div className={s.row}>
        {page?.stored && <Badge appearance="tint" color="success">{t('取り込んだ画像', 'Imported images')}</Badge>}
        {page?.sample && <Badge appearance="tint" color="informative">{t('見本のページ', 'Sample page')}</Badge>}
        {aiOn && (
          <>
            <Button size="small" appearance="primary" icon={<AiIcon tone="white" size={14} />} disabled={!page?.images.length || asking} onClick={() => void askAi()}>
              {picks ? t('AI にもう一度選んでもらう', 'Ask AI again') : t('AI に選んでもらう', 'Ask AI to choose')}
            </Button>
            <FeatureBadge id="ai.pageimage" />
            {asking && <Spinner size="tiny" label={t('AI が画像を見ています', 'AI is looking at the images')} />}
          </>
        )}
      </div>
      {error && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {loading ? (
        <Spinner size="small" label={t('ページを読んでいます', 'Reading the page')} />
      ) : page && page.images.length > 0 ? (
        <div className={s.grid}>
          {page.images.map((img, i) => {
            const a = angleOf(i)
            const rank = rankOf(i)
            const pick = picks?.find((x) => x.index === i)
            return (
              <button
                key={img.src}
                type="button"
                className={mergeClasses(s.tile, (trial.trial ? trial.trial.key === img.src : current === img.src) && s.tileOn)}
                title={pick?.reason ?? img.alt}
                onClick={() => tryImage(img.src, img.alt || t(`画像 ${i + 1}`, `Image ${i + 1}`), page.stored ? t('取り込んだ画像', 'Imported image') : url.trim(), img, i)}
              >
                <img className={s.thumb} src={appPath(img.src)} alt={img.alt} draggable={false} />
                <span className={s.marks}>
                  {img.main && <Badge size="small" appearance="filled" color="informative">{t('メイン', 'Main')}</Badge>}
                  {rank >= 0 && <Badge size="small" appearance="filled" color="brand">{t(`AI ${rank + 1}`, `AI ${rank + 1}`)}</Badge>}
                  {a && <Badge size="small" appearance="tint" color="informative">{angleName(a.angle)}</Badge>}
                  {img.model_usable_until && (
                    <Badge size="small" appearance="tint" color="warning" title={t('写っているモデルの使用期限。配信日より前に切れると、アラートが出ます', 'Model usage rights end on this date. An alert shows if it ends before the delivery day')}>
                      {t(`期限 ${img.model_usable_until}`, `Until ${img.model_usable_until}`)}
                    </Badge>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className={s.empty}>
          {fetchOn
            ? t('ページの画像がありません。「ほかの画像」のタブからも選べます', 'No images from the page. You can also use the Other image tab.')
            : t('取り込んだ画像がありません。「ほかの画像」のタブから選べます', 'No imported images. Use the Other image tab.')}
        </div>
      )}
      <span className={s.caption}>
        {aiOn
          ? t('押すとプレビューで試せます(確定で入れ替え)。AI は、画像ごとのアングルを見分け、配信のテーマ・見出し・コピーに合う画像を勧めます', 'Click to try it in the preview (Apply to switch). AI tells each image’s angle and recommends ones that fit the theme, headline and copy.')
          : t('押すとプレビューで試せます(確定で入れ替え)', 'Click to try it in the preview (Apply to switch)')}
      </span>
    </div>
  )
  const ownTab = (
    <div
      className={mergeClasses(s.drop, over && s.dropOn)}
      onPaste={(ev) => {
        const file = [...ev.clipboardData.files].find((f) => f.type.startsWith('image/'))
        if (file) {
          ev.preventDefault()
          void takeFile(file, t('貼り付けた画像', 'Pasted image'))
        }
      }}
      onDragOver={(ev) => {
        ev.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(ev) => {
        ev.preventDefault()
        setOver(false)
        const file = [...ev.dataTransfer.files].find((f) => f.type.startsWith('image/'))
        if (file) return void takeFile(file, file.name)
        // ほかのタブの画像を落としたときは、画像の URL が来る
        const dropped = (ev.dataTransfer.getData('text/uri-list') || ev.dataTransfer.getData('text/plain')).split('\n')[0]?.trim()
        if (dropped && /^https?:\/\//.test(dropped)) tryImage(dropped, dropped, dropped)
      }}
      tabIndex={0}
    >
      <span className={s.caption}>
        {t('商品ページの画像を右クリック →「画像をコピー」して、ここで Ctrl+V。ファイルを落とす・選ぶ、画像の URL を入れる、でも使えます', 'Right-click an image on the product page → "Copy image", then press Ctrl+V here. You can also drop or choose a file, or enter an image URL.')}
      </span>
      <div className={s.row}>
        <Button size="small" icon={<DocumentArrowUpRegular />} disabled={busy} onClick={() => fileRef.current?.click()}>
          {t('ファイルを選ぶ', 'Choose a file')}
        </Button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(ev) => void takeFile(ev.target.files?.[0], ev.target.files?.[0]?.name ?? '')} />
        {busy && <Spinner size="tiny" />}
      </div>
      <div className={s.row}>
        <Input size="small" className={s.grow} placeholder={t('画像の URL(https://…)', 'Image URL (https://…)')} value={own} onChange={(_, d) => setOwn(d.value)} />
        <Button size="small" disabled={!/^https?:\/\/\S+$/.test(own.trim())} onClick={() => tryImage(own.trim(), own.trim(), own.trim())}>
          {t('この URL を試す', 'Try this URL')}
        </Button>
      </div>
    </div>
  )
  return (
    <ChooseDrawer<Tab>
      open={open}
      onOpenChange={onOpenChange}
      hideTrigger={hideTrigger}
      label={t('画像を替える', 'Change image')}
      icon={<ImageEditRegular />}
      title={
        <span className={s.row}>
          {t(`画像を替える — ${product.name}`, `Change image — ${product.name}`)}
          {/* AB テストの B・C 案を開いているとき、その案の画像だけが替わる(X64 の e) */}
          {variant && <Badge appearance="tint" color="brand">{t(`${variant} 案だけ`, `Variant ${variant} only`)}</Badge>}
        </span>
      }
      top={
        <>
          <TrialBar state={trial} />
          {current && (
            <span className={s.row}>
              <span className={s.caption}>{variant ? t(`${variant} 案のいまの画像は、この配信で選んだ画像です`, `Variant ${variant} uses an image chosen for this delivery`) : t('いまは、この配信で選んだ画像です(商品のマスタの画像は変えていません)', 'Uses an image chosen for this delivery (the product master image is unchanged)')}</span>
              <Button
                size="small"
                appearance="subtle"
                icon={<ArrowUndoRegular />}
                onClick={() => {
                  settleRun('rejected')
                  e.setItemImage(itemKey, '', '')
                }}
              >
                {t('商品のマスタの画像に戻す', 'Back to the product master image')}
              </Button>
            </span>
          )}
        </>
      }
      tabs={[
        { value: 'page', label: t('商品ページの画像', 'Product page images'), icon: <ImageMultipleRegular />, content: pageTab },
        { value: 'own', label: t('ほかの画像', 'Other image'), icon: <ArrowUploadRegular />, content: ownTab },
      ]}
    />
  )
}

