// 差出人の名前と店の URL(ST10)。設定の画面の「全社」で既定を決め、「国」で上書きする(空の欄は全社の値)。
// 受信箱の 1 行・メールの上の帯・アプリの通知の差出人と、リンクの既定・商品のページの URL に使う(src/countrySettings.ts の brandFor)。
// 変えると全社(または国)の全員に効くので、確かめてから保存し、変えた人・日時を残す
import { useState } from 'react'
import { Button, Field, Input, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components'
import { SAMPLE_BRAND, brandHistoryOf, brandOwn, saveBrand, useCountrySettings, type Brand } from './countrySettings'
import { myName } from './history'
import { locale, useT } from './i18n'
import { confirmDialog } from './confirm'

const useStyles = makeStyles({
  body: { display: 'grid', rowGap: '14px', maxWidth: '640px' },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  history: { margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, maxHeight: '160px', overflowY: 'auto' },
})

interface Props {
  /** 国のコード。空なら全社の既定 */
  country: string
  /** 国の名前(確かめる文に出す。全社のときは使わない) */
  countryName?: string
}

const isUrl = (v: string) => /^https?:\/\/[^\s/]+\.[^\s]+$/.test(v)

export function BrandPanel({ country, countryName }: Props) {
  const s = useStyles()
  const t = useT()
  useCountrySettings()
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
  const fallback: Required<Brand> = isCompany
    ? SAMPLE_BRAND
    : { senderName: company.senderName || SAMPLE_BRAND.senderName, shopUrl: company.shopUrl || SAMPLE_BRAND.shopUrl }
  const set = (patch: Brand) => {
    setEdit({ ...draft, ...patch })
    setSaved(false)
  }
  const clean = (b: Brand): Brand => ({ senderName: b.senderName?.trim() || undefined, shopUrl: b.shopUrl?.trim().replace(/\/+$/, '') || undefined })
  const changed = JSON.stringify(clean(draft)) !== JSON.stringify(clean(current))
  const urlBad = !!draft.shopUrl?.trim() && !isUrl(draft.shopUrl.trim())
  const past = brandHistoryOf(country)
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '')

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
                {when(h.at)} {h.by}: {[h.brand.senderName || t('(空)', '(empty)'), h.brand.shopUrl || t('(空)', '(empty)')].join(' / ')}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
