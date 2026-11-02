// URL を貼って、そのページの画像を並べて選ぶ(content.hero.fromurl。2026-11-02 利用者)。
// メイン画像の入れ替えの引き出しと、制作の HeroPicker で使う。部品の画像(ボタン・バナー)の入れ替えにも、あとで同じものを差し込める。
// ページを読むのはサーバー(/api/product-pages/images。商品の画像を替えるのと同じ。安全策も同じ)。画像そのものの URL なら、読まずにその 1 枚を出す。
// 選んだあと(試す → 確定・写す・ライブラリに入れる)は、呼ぶ側が決める
import { useState } from 'react'
import { Badge, Button, Field, Input, MessageBar, MessageBarBody, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowDownloadRegular, OpenRegular } from '@fluentui/react-icons'
import { ProductPages, type PageImage } from '../data/productPages'
import { appPath } from '../appRoot'
import { isImageUrl } from '../heroFromUrl'
import { useT } from '../i18n'
import { FeatureBadge } from '../FeatureBadge'
import { useSmallImages } from './smallImages'

const useStyles = makeStyles({
  body: { display: 'grid', rowGap: '8px', minWidth: 0 },
  row: { display: 'flex', alignItems: 'flex-end', columnGap: '8px', flexWrap: 'wrap', rowGap: '6px' },
  grow: { flexGrow: 1, minWidth: '160px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: '8px', alignContent: 'start', padding: '2px' },
  tile: { display: 'grid', rowGap: '4px', padding: '4px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  tileOn: { outline: `2px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  // 画像は切らずに全体を見せる
  thumb: { width: '100%', aspectRatio: '4 / 3', objectFit: 'contain', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusSmall },
  name: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  empty: { display: 'grid', placeItems: 'center', minHeight: '80px', color: tokens.colorNeutralForeground3, border: `1px dashed ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, textAlign: 'center', padding: '12px' },
})

export interface UrlImagePick {
  src: string
  /** 画像の名前(ページの alt。なければ「画像 n」) */
  name: string
  /** 読んだページの URL(ライブラリの出どころに残す) */
  page: string
}

interface Props {
  /** 選んでいる画像(試している画像)の src */
  selected?: string
  onPick: (p: UrlImagePick) => void
  /** 読めなかったときに足す案内(例:「上げる」のタブで、手元の画像からも選べます) */
  fallbackHint?: string
  /** 下の説明(選んだあとの動きは呼ぶ側で違うので、変えられるように) */
  caption?: string
}

export function UrlImagePicker({ selected, onPick, fallbackHint, caption }: Props) {
  const s = useStyles()
  const t = useT()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState<{ sample: boolean; page: string; images: PageImage[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // アイコン・ロゴのような小さい画像は、並びから外す(下の一言で見られる)
  const small = useSmallImages()

  const read = async () => {
    const target = url.trim()
    if (!target) return
    setError(null)
    setPage(null)
    small.reset()
    // 画像そのものの URL: ページを読まずに、その 1 枚
    if (isImageUrl(target)) {
      setPage({ sample: false, page: target, images: [{ src: target, alt: '' }] })
      return
    }
    setLoading(true)
    try {
      const r = await ProductPages.images(target)
      setPage(r)
      if (r.images.length === 0) setError([t('このページから、画像を見つけられませんでした。', 'No images were found on this page.'), fallbackHint].filter(Boolean).join(' '))
    } catch (err) {
      // 外のサイトに出られない環境(Workbench など)では、ここに来る。理由をそのまま出し、ほかの選び方を案内する
      // サーバーの理由が「読めませんでした」から始まるときは、頭を重ねない
      const why = err instanceof Error ? err.message : String(err)
      setError([/読めません|Could not/.test(why) ? why : `${t('ページを読めませんでした', 'Could not read the page')}: ${why}`, fallbackHint].filter(Boolean).join(' '))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.body}>
      <div className={s.row}>
        <Field label={t('ページか画像の URL', 'Page or image URL')} size="small" className={s.grow}>
          <Input size="small" type="url" value={url} placeholder="https://…" onChange={(_, d) => setUrl(d.value)} onKeyDown={(ev) => ev.key === 'Enter' && void read()} />
        </Field>
        <Button size="small" icon={<ArrowDownloadRegular />} disabled={loading || !url.trim()} onClick={() => void read()}>
          {t('画像を読む', 'Load images')}
        </Button>
        <FeatureBadge id="content.hero.fromurl" />
        {page && !isImageUrl(page.page) && (
          <Button size="small" appearance="subtle" icon={<OpenRegular />} as="a" href={page.sample ? ProductPages.pageUrl(page.page) : page.page} target="_blank" rel="noreferrer">
            {t('ページを開く', 'Open the page')}
          </Button>
        )}
      </div>
      {page?.sample && (
        <span>
          <Badge appearance="tint" color="informative">{t('見本のページ', 'Sample page')}</Badge>
        </span>
      )}
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
            const name = img.alt || t(`画像 ${i + 1}`, `Image ${i + 1}`)
            return (
              <button
                key={img.src}
                type="button"
                className={mergeClasses(s.tile, selected === img.src && s.tileOn, small.hiddenClass(img.src, selected === img.src))}
                title={small.isSmall(img.src) ? t(`${name}(小さい画像。アイコン・ロゴかもしれません)`, `${name} (small; may be an icon or logo)`) : name}
                onClick={() => onPick({ src: img.src, name: img.alt, page: page.page })}
              >
                <img
                  className={s.thumb}
                  src={appPath(img.src)}
                  alt={img.alt}
                  draggable={false}
                  onLoad={small.onLoad(img.src)}
                />
                <span className={s.name}>{name}</span>
              </button>
            )
          })}
        </div>
      ) : (
        !error && <div className={s.empty}>{t('ページの URL を貼って「画像を読む」を押すと、そのページの画像が並びます。画像そのものの URL なら、その 1 枚が出ます', 'Paste a page URL and press Load images to list the images on it. An image URL shows just that image.')}</div>
      )}
      {!loading && small.note}
      <span className={s.caption}>{caption ?? t('押すとプレビューで試せます(確定で入れ替え)。確定した画像は、メイン画像のライブラリにも入ります', 'Click to try it in the preview (Apply to switch). The applied image is also added to the main image library.')}</span>
    </div>
  )
}
