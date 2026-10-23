import { useState } from 'react'
import { Button, Field, Input, makeStyles, tokens } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronRightRegular, OpenRegular } from '@fluentui/react-icons'
import type { Product } from './models/products'
import type { Item } from './items'
import { useT } from './i18n'
import { OpenLink } from './LinkText'
import { type LinkSlot, type Links, defaultUtm, isUrl, productContent, productUrl, variantCampaign, withUtm } from './links'
import { linkKindLabel } from './templates'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px', minWidth: 0 },
  head: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
  slot: { display: 'grid', rowGap: '2px', minWidth: 0 },
  // URL の欄と、そのページを開くボタン
  inputRow: { display: 'flex', alignItems: 'center', columnGap: '4px' },
  grow: { flexGrow: 1, minWidth: 0 },
  slotHead: { display: 'flex', alignItems: 'baseline', columnGap: '8px', flexWrap: 'wrap', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
  kind: { fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3 },
  // utm_content は自動で決まる値(手で変えると計測が壊れるので、見せるだけ)
  content: { fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3, fontFamily: tokens.fontFamilyMonospace },
  // プレビューの上の番号と同じ印
  num: {
    display: 'inline-block',
    minWidth: '18px',
    height: '18px',
    padding: '0 4px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    fontSize: '11px',
    lineHeight: '18px',
    textAlign: 'center',
  },
  final: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
  warn: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
  utm: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '8px' },
  products: { display: 'grid', rowGap: '4px', minWidth: 0 },
  productRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '8px', alignItems: 'center', fontSize: tokens.fontSizeBase200 },
  productUrl: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
  toggle: { justifySelf: 'start' },
})

interface Props {
  links: Links
  onLinks: (l: Links) => void
  slots: LinkSlot[]
  items: Item[]
  products: Product[]
  /** 計測用のパラメーターの campaign の既定値(配信日 + 配信カードの ID から作る。links.ts の campaignId) */
  campaign: string
  /** AB テストの、いま編集している案(campaign の末尾に付ける。X55) */
  variant?: string | null
  /** 欄にマウスを重ねた・入力欄を選んだ場所(プレビューで、その場所を光らせる。W12) */
  onFocusSlot?: (key: string | null) => void
}

/** 制作指示のタブの下に置く、リンク先の設定(メイン画像・ボタンごとの URL、計測用のパラメーター、商品のリンクの一覧) */
export function LinksEditor({ links, onLinks, slots, items, products, campaign, variant, onFocusSlot }: Props) {
  const styles = useStyles()
  const t = useT()
  const [showProducts, setShowProducts] = useState(false)
  const dflt = defaultUtm(campaign)
  const utm = { source: links.utm?.source || dflt.source, medium: links.utm?.medium || dflt.medium, campaign: variantCampaign(links.utm?.campaign || dflt.campaign, variant) }

  const valueOf = (s: LinkSlot) => (s.kind === 'hero' ? links.hero : links.buttons?.[s.key]) ?? ''
  const setSlot = (s: LinkSlot, v: string) =>
    s.kind === 'hero' ? onLinks({ ...links, hero: v }) : onLinks({ ...links, buttons: { ...links.buttons, [s.key]: v } })
  const setUtm = (k: 'source' | 'medium' | 'campaign', v: string) => onLinks({ ...links, utm: { ...links.utm, [k]: v } })

  return (
    <div className={styles.root}>
      <div>
        <div className={styles.head}>{t('リンク先 URL', 'Link URLs')}</div>
        <div className={styles.caption}>
          {t(
            '空欄は、テンプレートのリンク先の種類から作った URL(薄い文字)を使います。制作担当は、下の「計測用のパラメーターつき」の URL を使います。',
            'Empty fields use the URL made from the template’s link type (shown in light text). Production uses the URL “with tracking” below each field.',
          )}
          {t(
            ' 番号は、プレビューのリンクの場所の番号です。欄にマウスを重ねると、プレビューのその場所が光ります。',
            ' Numbers match the link spots on the preview. Hover a field to highlight its spot on the preview.',
          )}
        </div>
      </div>
      {slots.map((s, i) => {
        const v = valueOf(s)
        const url = v.trim() || s.defaultUrl
        return (
          <div
            key={s.key}
            className={styles.slot}
            onMouseEnter={() => onFocusSlot?.(s.key)}
            onMouseLeave={() => onFocusSlot?.(null)}
            onFocus={() => onFocusSlot?.(s.key)}
            onBlur={() => onFocusSlot?.(null)}
          >
            <div className={styles.slotHead}>
              <span className={styles.num}>{i + 1}</span>
              {s.label}
              <span className={styles.kind}>{linkKindLabel(s.linkKind)}</span>
              <span className={styles.content}>utm_content={s.content}</span>
            </div>
            <span className={styles.inputRow}>
              <Input className={styles.grow} size="small" value={v} placeholder={s.defaultUrl || t('URL を入れてください', 'Enter a URL')} onChange={(_, d) => setSlot(s, d.value)} />
              <OpenLink url={url} />
            </span>
            {!url && <span className={styles.warn}>{t('このボタンは、配信ごとに URL を決める設定です。URL を入れてください', 'This button needs a URL for each delivery. Enter one.')}</span>}
            {url && !isUrl(url) && <span className={styles.warn}>{t('URL の形式が正しくありません(https:// から始めてください)', 'This doesn’t look like a URL (start with https://)')}</span>}
            {url && isUrl(url) && <span className={styles.final}>{t('計測用のパラメーターつき: ', 'With tracking: ')}{withUtm(url, utm, s.content)}</span>}
          </div>
        )
      })}
      <div className={styles.slot}>
        <div className={styles.slotHead}>{t('計測用のパラメーター(すべてのリンクに付けます)', 'Tracking parameters (added to every link)')}</div>
        <div className={styles.utm}>
          <Field label="utm_source" size="small">
            <Input size="small" value={links.utm?.source ?? ''} placeholder={dflt.source} onChange={(_, d) => setUtm('source', d.value)} />
          </Field>
          <Field label="utm_medium" size="small">
            <Input size="small" value={links.utm?.medium ?? ''} placeholder={dflt.medium} onChange={(_, d) => setUtm('medium', d.value)} />
          </Field>
          <Field label="utm_campaign" size="small">
            <Input size="small" value={links.utm?.campaign ?? ''} placeholder={dflt.campaign} onChange={(_, d) => setUtm('campaign', d.value)} />
          </Field>
        </div>
        <div className={styles.caption}>
          {t(
            'utm_campaign は配信日と配信カードの ID から、utm_content はリンクの場所(hero・btn1…・商品の枠は p01-商品コード)から自動で決まります。GA で、どの配信のどのリンクが押されたかを見分けるためです。',
            'utm_campaign is made from the send date and the delivery card ID, and utm_content from the link spot (hero, btn1…, and p01-product code for product slots). This lets GA tell which link in which delivery was clicked.',
          )}
          {!campaign.includes('-') && t(' まだ保存していない配信は、保存すると utm_campaign に ID が付きます。', ' For an unsaved delivery, the ID is added to utm_campaign when you save.')}
        </div>
        {variant && (
          <div className={styles.caption}>
            {t(
              `AB テストの配信は、utm_campaign の末尾に案の印(-a・-b・-c)を付けます。いま編集している ${variant} 案のリンクは「${utm.campaign}」です`,
              `For A/B tests, the variant (-a, -b, -c) is added to the end of utm_campaign. Links for variant ${variant}, which you are editing, use “${utm.campaign}”.`,
            )}
          </div>
        )}
        <div>
        </div>
      </div>
      <Button
        size="small"
        appearance="subtle"
        className={styles.toggle}
        icon={showProducts ? <ChevronDownRegular /> : <ChevronRightRegular />}
        onClick={() => setShowProducts(!showProducts)}
      >
        {t(`商品のリンク(${items.length} 件。商品ページに自動で付きます)`, `Product links (${items.length}; set automatically to each product page)`)}
      </Button>
      {showProducts && (
        <div className={styles.products}>
          {items.map((it, i) => {
            const p = products.find((x) => x.id === it.productId)
            const url = withUtm(productUrl(p), utm, productContent(i, p?.product_code))
            return (
              <div key={it.key} className={styles.productRow}>
                <div>
                  <div>{p?.name ?? '—'}</div>
                  <div className={styles.productUrl}>{url || t('商品コードがないため、リンクを作れません', 'No product code, so no link')}</div>
                </div>
                {url && <Button size="small" appearance="subtle" icon={<OpenRegular />} as="a" href={url} target="_blank" rel="noreferrer" aria-label={t('開く', 'Open')} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
