// 差出人の名前と店の URL(ST10)、計測用の utm_source・utm_medium(2026-10-28 配信カードの ⑤ から移した)。
// 設定の画面の「全社」で既定を決め、「国」で上書きする(空の欄は全社の値)。
// 受信箱の 1 行・メールの上の帯・アプリの通知の差出人と、リンクの既定・商品のページの URL、リンクの utm に使う(src/countrySettings.ts の brandFor・utmFixedFor)。
// 店の URL の形(settings.shopurl。商品・カテゴリ・配信のページの URL を {shop} などで組む)も、ここで決める。打ち間違いに気づけるように、見本の URL を出す。
// 変えると全社(または国)の全員に効くので、確かめてから保存し、変えた人・日時を残す
import { useState } from 'react'
import { Button, Field, InfoLabel, Input, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components'
import { typo } from './typo'
import { SAMPLE_BRAND, brandHistoryOf, brandOwn, layerBrand, saveBrand, useCountrySettings, type Brand } from './countrySettings'
import { myName } from './history'
import { useT, when } from './i18n'
import { confirmDialog } from './confirm'
import { useFeature } from './featureFlags'
import { FeatureBadge } from './FeatureBadge'
import { UrlPatternFields } from './UrlPatternFields'
import { cardMarket, productMarket } from './market'
import type { Product } from './models/products'

const useStyles = makeStyles({
  body: { display: 'grid', rowGap: '14px', maxWidth: '640px' },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  label: typo.label,
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  utm: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', columnGap: '12px', rowGap: '8px' },
  section: { ...typo.heading, marginTop: '4px' },
  history: { margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, maxHeight: '160px', overflowY: 'auto' },
  sectionRow: { display: 'flex', alignItems: 'center', columnGap: '6px', marginTop: '4px' },
})

interface Props {
  /** 国のコード。空なら全社の既定 */
  country: string
  /** 国の名前(確かめる文に出す。全社のときは使わない) */
  countryName?: string
  /** 見本の URL に使う商品(その国の市場の商品の先頭。全社なら、すべての商品の先頭) */
  products?: Product[]
}

const isUrl = (v: string) => /^https?:\/\/[^\s/]+\.[^\s]+$/.test(v)

export function BrandPanel({ country, countryName, products = [] }: Props) {
  const s = useStyles()
  const t = useT()
  useCountrySettings()
  const patternsOn = useFeature('settings.shopurl')
  const isCompany = !country
  // 変えている途中の値(なければ、いま決まっている値。設定を読み終える前に開いても、読んだ値が出るように、写さずに持つ)
  const [edit, setEdit] = useState<Brand | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const current = brandOwn(country)
  const draft = edit ?? current
  const company = brandOwn('')
  // 空の欄に出す、代わりに使われる値(国は全社の値、全社は見本の値)
  const fallback: Required<Brand> = isCompany ? SAMPLE_BRAND : layerBrand(company)
  const set = (patch: Brand) => {
    setEdit({ ...draft, ...patch })
    setSaved(false)
  }
  const clean = (b: Brand): Brand => ({
    senderName: b.senderName?.trim() || undefined,
    shopUrl: b.shopUrl?.trim().replace(/\/+$/, '') || undefined,
    utmSource: b.utmSource?.trim() || undefined,
    utmMediumEmail: b.utmMediumEmail?.trim() || undefined,
    utmMediumApp: b.utmMediumApp?.trim() || undefined,
    productUrlPattern: b.productUrlPattern?.trim() || undefined,
    categoryUrlPattern: b.categoryUrlPattern?.trim() || undefined,
    campaignUrlPattern: b.campaignUrlPattern?.trim() || undefined,
  })
  // 空の欄の説明(国は全社の値、全社は既定の値)
  const emptyHint = (v: string) => (isCompany ? t(`空なら既定の値: ${v}`, `Empty uses the default: ${v}`) : t(`空なら全社の値: ${v}`, `Empty uses the company value: ${v}`))
  const changed = JSON.stringify(clean(draft)) !== JSON.stringify(clean(current))
  const urlBad = !!draft.shopUrl?.trim() && !isUrl(draft.shopUrl.trim())
  const past = brandHistoryOf(country)
  // URL の形: いま使われる形(空の欄は代わりの値)と、見本の URL
  const shown = layerBrand(draft, fallback)
  const market = isCompany ? null : cardMarket(country)
  const sampleCountry = isCompany ? (products[0] ? productMarket(products[0]) : 'JP') : country
  // 欄に出す商品(その国の市場の商品。全社なら、すべて)
  const pickable = market ? products.filter((p) => productMarket(p) === market) : products

  const save = async () => {
    const msg = isCompany
      ? t('全部の国の配信に効きます(国で上書きしている所は、国の値のまま)。保存しますか?', 'This applies to deliveries in every country (countries with their own value keep it). Save?')
      : t(`${countryName ?? country}の全員に効きます。保存しますか?`, `This applies to everyone working on ${countryName ?? country}. Save?`)
    if (!(await confirmDialog(msg))) return
    setBusy(true)
    setError(null)
    try {
      await saveBrand(country, clean(draft), myName() || t('(名前なし)', '(no name)'))
      setEdit(null)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.body}>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {saved && (
        <MessageBar intent="success" layout="multiline">
          <MessageBarBody>{t('保存しました', 'Saved')}</MessageBarBody>
        </MessageBar>
      )}
      <Field
        label={t('差出人の名前', 'Sender name')}
        hint={isCompany ? t('空なら見本の値(SHOP)', 'Empty uses the sample value (SHOP)') : t(`空なら全社の値: ${fallback.senderName}`, `Empty uses the company value: ${fallback.senderName}`)}
        size="small"
      >
        <Input value={draft.senderName ?? ''} placeholder={fallback.senderName} onChange={(_, d) => set({ senderName: d.value })} />
      </Field>
      <Field
        label={t('店の URL', 'Shop URL')}
        hint={isCompany ? t(`空なら見本の値(${SAMPLE_BRAND.shopUrl})。リンクの既定(トップ・カテゴリ・配信のページ)と、商品のページの URL の元になります`, `Empty uses the sample value (${SAMPLE_BRAND.shopUrl}). Used for default links (top, category, campaign page) and product page URLs`) : t(`空なら全社の値: ${fallback.shopUrl}`, `Empty uses the company value: ${fallback.shopUrl}`)}
        validationState={urlBad ? 'error' : 'none'}
        validationMessage={urlBad ? t('https:// から始まる URL を入れてください', 'Enter a URL starting with https://') : undefined}
        size="small"
      >
        <Input value={draft.shopUrl ?? ''} placeholder={fallback.shopUrl} onChange={(_, d) => set({ shopUrl: d.value })} />
      </Field>
      {patternsOn && (
        <>
          <div className={s.sectionRow}>
            <InfoLabel
              className={s.section}
              info={t(
                '商品に URL(取り込んだ商品ページの URL)があれば、商品ページはそちらを使います。変えると、これから作る配信と、まだ制作に渡していない配信のリンクに効きます(渡した配信の商品の URL は変わりません)。',
                'If a product has its own URL (from the imported product page), the product page uses it. Changes apply to new deliveries and ones not yet handed to production (product URLs already handed off do not change).',
              )}
            >
              {t('店の URL の形', 'Shop URL patterns')}
            </InfoLabel>
            <FeatureBadge id="settings.shopurl" />
          </div>
          <div className={s.note}>
            {t(
              '自社のサイトで、実際のページの URL を 1 つ貼ってください。CCP がその中から商品コードなどを見つけて、ほかの商品の URL も組み立てられる形にします。',
              'Paste one real page URL from your site. CCP finds the product code (and so on) in it and makes a pattern that builds URLs for other products too.',
            )}
          </div>
          <UrlPatternFields
            patterns={{ productUrlPattern: shown.productUrlPattern, categoryUrlPattern: shown.categoryUrlPattern, campaignUrlPattern: shown.campaignUrlPattern }}
            draft={draft}
            fallback={fallback}
            shop={shown.shopUrl}
            products={pickable}
            country={sampleCountry}
            onChange={(key, v) => set({ [key]: v })}
          />
        </>
      )}
      {/* 計測用のパラメーター。utm_campaign・utm_content は配信ごとに自動で決まるので、ここでは決めない */}
      <span className={s.section}>{t('計測用のパラメーター(すべてのリンクに付けます)', 'Tracking parameters (added to every link)')}</span>
      <div className={s.note}>
        {t(
          'GA で、配信から来た人を見分けるための値です。utm_campaign(配信日と配信カードの ID)と utm_content(リンクの場所)は、配信ごとに自動で決まります。変えると、これから作る配信と、まだ制作に渡していない配信のリンクに効きます(渡した配信の URL は変わりません)。',
          'Values that let GA tell visitors from deliveries apart. utm_campaign (send date and delivery card ID) and utm_content (link spot) are set automatically per delivery. Changes apply to new deliveries and ones not yet handed to production (URLs already handed off do not change).',
        )}
      </div>
      <div className={s.utm}>
        <Field label="utm_source" hint={emptyHint(fallback.utmSource)} size="small">
          <Input value={draft.utmSource ?? ''} placeholder={fallback.utmSource} onChange={(_, d) => set({ utmSource: d.value })} />
        </Field>
        <Field label={t('utm_medium(メール)', 'utm_medium (email)')} hint={emptyHint(fallback.utmMediumEmail)} size="small">
          <Input value={draft.utmMediumEmail ?? ''} placeholder={fallback.utmMediumEmail} onChange={(_, d) => set({ utmMediumEmail: d.value })} />
        </Field>
        <Field label={t('utm_medium(アプリ)', 'utm_medium (app)')} hint={emptyHint(fallback.utmMediumApp)} size="small">
          <Input value={draft.utmMediumApp ?? ''} placeholder={fallback.utmMediumApp} onChange={(_, d) => set({ utmMediumApp: d.value })} />
        </Field>
      </div>
      <div className={s.actions}>
        <Button appearance="primary" disabled={!changed || busy || urlBad} onClick={() => void save()}>
          {t('保存', 'Save')}
        </Button>
        <Button disabled={!changed || busy} onClick={() => setEdit(null)}>
          {t('変更を取り消す', 'Discard changes')}
        </Button>
      </div>
      <div>
        <span className={s.label}>{t('変更の履歴', 'Change history')}</span>
        {past.length === 0 ? (
          <div className={s.note}>{isCompany ? t('まだ変えていません(見本の値)', 'Not changed yet (sample values)') : t('まだ変えていません(全社の値)', 'Not changed yet (company values)')}</div>
        ) : (
          <ul className={s.history}>
            {past.slice(0, 20).map((h, i) => (
              <li key={i}>
                {when(h.at)} {h.by}: {[h.brand.senderName, h.brand.shopUrl, h.brand.utmSource, h.brand.utmMediumEmail, h.brand.utmMediumApp].map((v) => v || t('(空)', '(empty)')).join(' / ')}
                {[h.brand.productUrlPattern, h.brand.categoryUrlPattern, h.brand.campaignUrlPattern].some(Boolean) &&
                  ` / ${[h.brand.productUrlPattern, h.brand.categoryUrlPattern, h.brand.campaignUrlPattern].map((v) => v || t('(空)', '(empty)')).join(' / ')}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
