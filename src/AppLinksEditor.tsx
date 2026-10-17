import { useState } from 'react'
import { Button, Field, Input, Select, makeStyles, tokens } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronRightRegular } from '@fluentui/react-icons'
import type { Product } from './models/products'
import type { Item } from './items'
import { optionLabel, tr, useT } from './i18n'
import { fcmText, screenOf, type AppScreen, type AppScreenKind, type LinkSlot, type Links } from './links'
import { tapScreen, type PushLink, type PushLinkKind } from './pushLink'
import { linkKindLabel } from './templates'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px', minWidth: 0 },
  head: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
  slot: { display: 'grid', rowGap: '4px', minWidth: 0 },
  slotHead: { display: 'flex', alignItems: 'baseline', columnGap: '8px', flexWrap: 'wrap', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
  kind: { fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3 },
  // プレビューの上の番号と同じ印(LinksEditor と同じ)
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
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '8px' },
  data: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
  warn: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
  products: { display: 'grid', rowGap: '4px', minWidth: 0 },
  productRow: { fontSize: tokens.fontSizeBase200 },
  toggle: { justifySelf: 'start' },
})

/** アプリの画面の種類の名前 */
function screenKindLabel(kind: AppScreenKind): string {
  switch (kind) {
    case 'message':
      return tr('このメッセージ(メッセージボックス)', 'This message (message box)')
    case 'campaign':
      return tr('配信のページ(特集)', 'Campaign page')
    case 'category':
      return tr('カテゴリのページ', 'Category page')
    case 'product':
      return tr('商品のページ', 'Product page')
    case 'home':
      return tr('アプリのホーム', 'App home')
    default:
      return tr('画面の名前を指定', 'Screen name')
  }
}

const describe = (sc: AppScreen | null) => (sc ? `${screenKindLabel(sc.kind)}${sc.value ? `: ${sc.value}` : ''}` : '')

interface Props {
  links: Links
  onLinks: (l: Links) => void
  slots: LinkSlot[]
  items: Item[]
  products: Product[]
  /** FCM の data の campaign(配信名と日付から作る) */
  campaign: string
  /** 通知を押したときに開く画面(配信カードの push_link) */
  pushLink: PushLink | null
  onPushLink: (l: PushLink) => void
  /** 欄にマウスを重ねた・入力欄を選んだ場所(プレビューで、その場所を光らせる) */
  onFocusSlot?: (key: string | null) => void
}

/**
 * アプリの配信カードの「⑤ リンク先」。通知(FCM)を押したときに開く画面と、
 * メッセージボックスに届くメッセージの、メイン画像・ボタンごとの開く画面を決める。
 * 開く画面は、URL ではなく、FCM の data(screen と、画面に渡す値)で伝える
 */
export function AppLinksEditor({ links, onLinks, slots, items, products, campaign, pushLink, onPushLink, onFocusSlot }: Props) {
  const styles = useStyles()
  const t = useT()
  const [showProducts, setShowProducts] = useState(false)
  const itemProducts = items.map((it) => products.find((p) => p.id === it.productId)).filter((p): p is Product => !!p)
  const first = itemProducts[0]
  const tap = tapScreen(pushLink, { product_code: first?.product_code, category: optionLabel(first?.category_name) || undefined })

  const tapKinds: PushLinkKind[] = ['message', 'campaign', 'product', 'category', 'home', 'custom']
  const slotKinds: AppScreenKind[] = ['campaign', 'category', 'product', 'home', 'custom']
  const setScreen = (slot: LinkSlot, sc: AppScreen | null) => {
    const screens = { ...links.screens }
    if (sc) screens[slot.key] = sc
    else delete screens[slot.key]
    onLinks({ ...links, screens })
  }

  return (
    <div className={styles.root}>
      <div>
        <div className={styles.head}>{t('開くアプリの画面', 'App screens to open')}</div>
        <div className={styles.caption}>
          {t(
            'アプリの通知は、Firebase Cloud Messaging(FCM)で送ります。開く画面は URL ではなく、通知の data に入れる screen(画面の名前)と、画面に渡す値で伝えます。各欄の下の 1 行が、data に入れる値です。',
            'App notifications are sent with Firebase Cloud Messaging (FCM). Instead of a URL, the screen to open is passed in the notification’s data as screen (the screen name) plus the values that screen needs. The line under each field is the data to send.',
          )}
        </div>
      </div>

      <div className={styles.slot}>
        <Field label={t('通知を押したときに開く画面', 'Opens when the notification is tapped')} size="small">
          <Select size="small" value={pushLink?.kind ?? ''} onChange={(_, d) => onPushLink({ kind: d.value as PushLinkKind, url: pushLink?.url })}>
            <option value="" disabled>{t('選んでください', 'Choose')}</option>
            {tapKinds.map((k) => (
              <option key={k} value={k}>{k === 'product' ? t('紹介する商品のページ(最初の商品)', 'Featured product page (first item)') : k === 'category' ? t('カテゴリのページ(最初の商品のカテゴリ)', 'Category page (first item’s category)') : screenKindLabel(k)}</option>
            ))}
          </Select>
        </Field>
        {pushLink?.kind === 'custom' && (
          <Field label={t('画面の名前(screen)', 'Screen name (screen)')} size="small">
            <Input size="small" value={pushLink.url ?? ''} placeholder="coupon_list" onChange={(_, d) => onPushLink({ kind: 'custom', url: d.value })} />
          </Field>
        )}
        {tap && fcmText(tap, campaign) ? (
          <span className={styles.data}>data: {fcmText(tap, campaign)}</span>
        ) : (
          <span className={styles.warn}>
            {pushLink?.kind === 'product' || pushLink?.kind === 'category'
              ? t('メッセージに商品を入れると、開く画面が決まります', 'Add a product to the message to decide the screen')
              : t('開く画面を決めてください', 'Choose the screen to open')}
          </span>
        )}
      </div>

      <div>
        <div className={styles.head}>{t('メッセージのリンク先', 'Links in the message')}</div>
        <div className={styles.caption}>
          {t(
            'メッセージボックスで開いたメッセージの、メイン画像・ボタンを押したときに開く画面です。「既定」は、テンプレートのリンク先の種類から決まります。番号は、プレビューのリンクの場所の番号です。',
            'Screens opened from the main image and buttons of the message in the message box. “Default” comes from the template’s link type. Numbers match the link spots on the preview.',
          )}
        </div>
      </div>
      {slots.map((s, i) => {
        const set = links.screens?.[s.key]
        const sc = screenOf(links, s)
        const text = fcmText(sc, campaign)
        const needsValue = set && (set.kind === 'category' || set.kind === 'product' || set.kind === 'custom')
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
            </div>
            <div className={needsValue ? styles.row : undefined}>
              <Select
                size="small"
                value={set?.kind ?? ''}
                onChange={(_, d) => setScreen(s, d.value ? { kind: d.value as AppScreenKind, value: d.value === 'product' ? first?.product_code : undefined } : null)}
              >
                <option value="">{s.defaultScreen ? t(`既定(${describe(s.defaultScreen)})`, `Default (${describe(s.defaultScreen)})`) : t('選んでください', 'Choose')}</option>
                {slotKinds.map((k) => (
                  <option key={k} value={k}>{screenKindLabel(k)}</option>
                ))}
              </Select>
              {set?.kind === 'product' && (
                <Select size="small" value={set.value ?? ''} onChange={(_, d) => setScreen(s, { kind: 'product', value: d.value })}>
                  <option value="" disabled>{t('商品を選んでください', 'Choose a product')}</option>
                  {itemProducts.filter((p) => p.product_code).map((p) => (
                    <option key={p.id} value={p.product_code}>{`${p.product_code} ${p.name}`}</option>
                  ))}
                </Select>
              )}
              {set?.kind === 'category' && (
                <Input size="small" value={set.value ?? ''} placeholder={t('カテゴリ名', 'Category name')} onChange={(_, d) => setScreen(s, { kind: 'category', value: d.value })} />
              )}
              {set?.kind === 'custom' && (
                <Input size="small" value={set.value ?? ''} placeholder="coupon_list" onChange={(_, d) => setScreen(s, { kind: 'custom', value: d.value })} />
              )}
            </div>
            {text ? <span className={styles.data}>data: {text}</span> : <span className={styles.warn}>{t('開く画面を決めてください', 'Choose the screen to open')}</span>}
          </div>
        )
      })}

      <Button
        size="small"
        appearance="subtle"
        className={styles.toggle}
        icon={showProducts ? <ChevronDownRegular /> : <ChevronRightRegular />}
        onClick={() => setShowProducts(!showProducts)}
      >
        {t(`商品のリンク(${items.length} 件。商品のページを自動で開きます)`, `Product links (${items.length}; open each product page automatically)`)}
      </Button>
      {showProducts && (
        <div className={styles.products}>
          {items.map((it) => {
            const p = products.find((x) => x.id === it.productId)
            const text = p?.product_code ? fcmText({ kind: 'product', value: p.product_code }, campaign) : ''
            return (
              <div key={it.key} className={styles.productRow}>
                <div>{p?.name ?? '—'}</div>
                <div className={styles.data}>{text ? `data: ${text}` : t('商品コードがないため、リンクを作れません', 'No product code, so no link')}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
