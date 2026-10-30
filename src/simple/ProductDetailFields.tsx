// 商品の枠の見せ方「ふつう | 詳しく」(X80)。部品のペインの「商品を入れ替える」「画像を替える」の行のすぐ下に、小さく薄い切り替えで置く
// (2026-10-30 利用者: 横長のボタンは分かりにくかった。いまの見せ方が見えるので「ふつうに戻す」は置かない)。
// 「詳しく」にすると、その枠だけ横いっぱいの行(写真 + 見出し + 長い説明)になり、すぐ下に見出し・説明文の欄が出る。ふつうに戻すと、見出し・説明文も消える。
// 枠の数・順番は変えない。説明文を商品ページから AI に下書きしてもらうのは段 ③(ページの本文を残す段 ② のあと)
import { Field, Input, Tab, TabList, makeStyles, tokens } from '@fluentui/react-components'
import { AutoTextarea } from '../AutoTextarea'
import { useT } from '../i18n'
import { typo } from '../typo'
import type { Item } from '../items'

const useStyles = makeStyles({
  toggle: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  // ラベルは値に付く目印として小さく薄く(LabeledValue と同じ決まり)
  label: { ...typo.label, whiteSpace: 'nowrap' },
  fields: { display: 'grid', rowGap: '8px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  count: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, justifySelf: 'end' },
})

/** 説明文の目安の長さ(見出し 1 行 + 本文 200〜400 字くらい。利用者と決めた) */
const BODY_MIN = 200
const BODY_MAX = 400

export function ProductDetailFields({ item, onChange, detailCount }: { item: Item; onChange: (detail: Item['detail'] | null) => void; detailCount: number }) {
  const s = useStyles()
  const t = useT()
  const len = item.detail?.body.length ?? 0
  return (
    <>
      <div className={s.toggle}>
        <span className={s.label}>{t('見せ方', 'Display')}</span>
        <TabList
          size="small"
          appearance="subtle"
          selectedValue={item.detail ? 'detail' : 'normal'}
          onTabSelect={(_, d) => {
            if (d.value === 'detail' && !item.detail) onChange({ title: '', body: '' })
            if (d.value === 'normal' && item.detail) onChange(null)
          }}
          aria-label={t('この商品の見せ方', 'How this product is shown')}
        >
          <Tab value="normal">{t('ふつう', 'Normal')}</Tab>
          <Tab value="detail" title={t('この枠だけ横いっぱいの行にして、写真と見出し・長い説明でしっかり見せます(枠の数・順番は変わりません)', 'Make just this slot a full-width row with a photo, heading and long description (slot count and order do not change)')}>
            {t('詳しく', 'Detailed')}
          </Tab>
        </TabList>
      </div>
      {item.detail && (
        <div className={s.fields}>
          <Field label={t('見出し', 'Heading')} size="small">
            <Input size="small" value={item.detail.title} placeholder={t('例: 軽くて暖かい、ふっくらした中わた', 'e.g. Light, warm, and lofty fill')} onChange={(_, d) => onChange({ title: d.value, body: item.detail?.body ?? '' })} />
          </Field>
          <Field label={t('説明文', 'Description')} hint={t(`${BODY_MIN}〜${BODY_MAX} 字くらい。箇条書きも使えます`, `About ${BODY_MIN}–${BODY_MAX} characters. Bullet points are fine`)} size="small">
            <AutoTextarea heightKey="ProductDetailFields.body" size="small" rows={5} value={item.detail.body} onChange={(_, d) => onChange({ title: item.detail?.title ?? '', body: d.value })} />
          </Field>
          <span className={s.count}>{t(`${len} 字`, `${len} chars`)}</span>
          {/* 止めずに知らせる(2026-10-26 利用者: 上限は付けず、3 つ以上で注意) */}
          {detailCount >= 3 && <span className={s.note}>{t(`「詳しく」の枠が ${detailCount} つあります。長いメールになります`, `${detailCount} slots are in detail. The email will be long`)}</span>}
        </div>
      )}
    </>
  )
}
