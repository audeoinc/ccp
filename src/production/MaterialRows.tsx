// 制作の材料を 1 行ずつ写す欄(P10・P11・P21。2026-11-02 Plan と Production のシンプル版を仕上げる)。
// シンプルな制作の画面の、何も選んでいないときのペイン(配信の全体)に差し込む: 商品(画像・コード・価格・URL)、リンク先と計測の対応表(utm_content)、部品の画像。
// 制作がいちばん写すものなので、行ごとにコピーのボタン(CopyButton。配信カードと同じ形)、見出しの右に「すべてコピー」(表計算に貼れるタブ区切り)。
// 詳しい制作の画面の ProductionInfoPane と同じ中身を、シンプルの見た目(LabeledValue・見出し 13px)で出す。直すのは部品のペインで(ここは写すだけ)
import type { ReactNode } from 'react'
import { InfoLabel, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { linkRows, productRows, rowsText, trackingRows, type Snapshot } from '../productionSnapshot'
import type { VariantKey } from '../abTest'
import { productImage } from '../images'
import { useT } from '../i18n'
import { typo } from '../typo'
import { CopyButton } from '../CopyButton'
import { LabeledValue } from '../LabeledValue'
import { PartPicker } from '../PartPicker'
import { useFeature } from '../featureFlags'
import { FeatureBadge } from '../FeatureBadge'

const useStyles = makeStyles({
  section: { display: 'grid', rowGap: '6px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  title: { ...typo.heading, flexGrow: 1, minWidth: 0 },
  list: { display: 'grid', rowGap: '4px', minWidth: 0 },
  // 1 行(中身・コピー)。行を押して部品を選ぶときは onSelect
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'start', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  productRow: { gridTemplateColumns: '44px minmax(0, 1fr) auto', columnGap: '8px', alignItems: 'center' },
  pickable: { cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  // 商品の画像は切らずに全景(画像は切らない決まり)
  thumb: { width: '44px', height: '44px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  body: { display: 'grid', rowGap: '2px', minWidth: 0 },
  name: { ...typo.valueStrong, overflowWrap: 'anywhere' },
  meta: { display: 'flex', flexWrap: 'wrap', columnGap: '12px', rowGap: '2px', minWidth: 0 },
  url: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
  caption: typo.caption,
})

/** 見出し(題・数・ⓘ)と、右に「すべてコピー」 */
function MaterialSection({ title, count, info, copyAll, copyAllLabel, badge, children }: { title: string; count?: number; info?: ReactNode; copyAll?: string; copyAllLabel?: string; badge?: ReactNode; children: ReactNode }) {
  const s = useStyles()
  const t = useT()
  const label = count === undefined ? title : t(`${title}(${count})`, `${title} (${count})`)
  return (
    <div className={s.section}>
      <div className={s.head}>
        {info ? (
          <InfoLabel className={s.title} size="small" info={info}>
            {label}
          </InfoLabel>
        ) : (
          <span className={s.title}>{label}</span>
        )}
        {badge}
        {copyAll !== undefined && <CopyButton text={copyAll} label={copyAllLabel ?? t('すべてコピー', 'Copy all')} />}
      </div>
      {children}
    </div>
  )
}

interface RowsProps {
  /** いま見せる写し(直していれば、直したもの) */
  snapshot: Snapshot
  /** AB テストの案(省くと A。案ごとに utm_campaign が変わる) */
  variant?: VariantKey
}

/**
 * 商品(P10): 1 行ずつ、画像・名前・コード・価格・商品ページの URL(計測用のパラメーターつき)。
 * onSelect を渡すと、行を押してその商品の部品を選べる(並びの位置 at を返す)
 */
export function ProductMaterialRows({ snapshot, variant, onSelect }: RowsProps & { onSelect?: (at: number) => void }) {
  const s = useStyles()
  const t = useT()
  const on = useFeature('prod.page')
  if (!on) return null
  const rows = productRows(snapshot, variant)
  const line = (r: (typeof rows)[number]) => [r.section, r.product.name, r.product.product_code, r.price, r.url].filter(Boolean).join('\t')
  return (
    <MaterialSection
      title={t('商品', 'Products')}
      count={rows.length}
      badge={<FeatureBadge id="prod.page" />}
      copyAll={rows.length ? ['section\tname\tproduct_code\tprice\turl', ...rows.map(line)].join('\n') : undefined}
      copyAllLabel={t('商品をすべてコピー(表計算に貼れる形)', 'Copy all products (for a spreadsheet)')}
    >
      {rows.length ? (
        <div className={s.list}>
          {rows.map((r) => (
            <div
              key={`${r.product.id}-${r.at}`}
              className={mergeClasses(s.row, s.productRow, onSelect && s.pickable)}
              onClick={onSelect ? () => onSelect(r.at) : undefined}
            >
              <img className={s.thumb} src={productImage(r.product) ?? ''} alt="" />
              <span className={s.body}>
                <span className={s.name}>{r.product.name}</span>
                <span className={s.meta}>
                  <LabeledValue label={t('コード', 'Code')} copy>
                    {r.product.product_code ?? ''}
                  </LabeledValue>
                  <LabeledValue label={t('価格', 'Price')}>{r.price}</LabeledValue>
                  {r.section && <LabeledValue label={t('セクション', 'Section')}>{r.section}</LabeledValue>}
                </span>
                {r.url && <span className={s.url}>{r.url}</span>}
              </span>
              <CopyButton text={r.url} label={t('商品ページの URL をコピー(計測用のパラメーターつき)', 'Copy the product page URL (with tracking)')} />
            </div>
          ))}
        </div>
      ) : (
        <span className={s.caption}>{t('載せた商品はありません', 'No products')}</span>
      )}
    </MaterialSection>
  )
}

/**
 * リンク先と計測の対応表(P11): 場所ごとの URL(計測用のパラメーターつき)と、utm_content ごとの説明・商品コード。
 * utm_content は ID だけなので、人が読む説明と並べて渡す(制作が HTML に入れ、分析が引く)。アプリの配信は、開く画面
 */
export function LinkMaterialRows({ snapshot, variant, onSelect }: RowsProps & { onSelect?: (slotKey: string) => void }) {
  const s = useStyles()
  const t = useT()
  const on = useFeature('prod.page')
  if (!on) return null
  const links = linkRows(snapshot, variant).filter((r) => r.value)
  const tracking = trackingRows(snapshot, variant)
  return (
    <>
      <MaterialSection title={t('リンク先', 'Links')} count={links.length} badge={<FeatureBadge id="prod.page" />} copyAll={links.length ? rowsText(links) : undefined} copyAllLabel={t('リンク先をすべてコピー', 'Copy all links')}>
        {links.length ? (
          <div className={s.list}>
            {links.map((r) => {
              const slotKey = r.slotKey
              return (
                <div key={slotKey ?? r.label} className={mergeClasses(s.row, onSelect && slotKey && s.pickable)} onClick={onSelect && slotKey ? () => onSelect(slotKey) : undefined}>
                  <span className={s.body}>
                    <LabeledValue label={r.label} layout="stacked">
                      <span className={s.url}>{r.value}</span>
                    </LabeledValue>
                  </span>
                  <CopyButton text={r.value} label={t(`${r.label} のリンク先をコピー`, `Copy the ${r.label} link`)} />
                </div>
              )
            })}
          </div>
        ) : (
          <span className={s.caption}>{t('リンク先はありません', 'No links')}</span>
        )}
      </MaterialSection>
      {tracking.length > 0 && (
        <MaterialSection
          title={t('計測の対応表(utm_content)', 'Tracking map (utm_content)')}
          count={tracking.length}
          info={t(
            'リンクごとの utm_content と、その説明です。表のテンプレートは、押された要素の ID(箱の写真・名前などは別々のリンク)。すべてコピーすると、表計算に貼れる形(タブ区切り)になります',
            'Each link’s utm_content and what it is. Table templates use the ID of the clicked element (a box’s photo, name, etc. are separate links). Copy all gives tab-separated rows for a spreadsheet.',
          )}
          copyAll={['utm_content\tdescription\tproduct_code\turl', ...tracking.map((r) => [r.content, r.desc, r.productCode ?? '', r.url].join('\t'))].join('\n')}
          copyAllLabel={t('計測の対応表をすべてコピー(表計算に貼れる形)', 'Copy the tracking map (for a spreadsheet)')}
        >
          <div className={s.list}>
            {tracking.map((r) => (
              <div key={`${r.content}-${r.url}`} className={s.row}>
                <span className={s.body}>
                  <LabeledValue label={r.desc} copy={r.content} copyLabel={t('utm_content をコピー', 'Copy utm_content')}>
                    {r.content}
                  </LabeledValue>
                  {r.productCode && (
                    <LabeledValue label={t('コード', 'Code')}>{r.productCode}</LabeledValue>
                  )}
                </span>
                <CopyButton text={r.url} label={t('計測用のパラメーターつきの URL をコピー', 'Copy the URL with tracking')} />
              </div>
            ))}
          </div>
        </MaterialSection>
      )}
    </>
  )
}

/**
 * 部品の画像(P21): 配信の国のライブラリにある、期限内のボタン・バナー・ロゴ・アイコン。URL か <img> のタグをコピーして HTML に貼る。
 * 中身は詳しい制作の画面と同じ PartPicker(コピーの 2 つのボタン・タグの作り方を 1 つにしておくため)
 */
export function PartImageRows({ market }: { market: 'US' | 'JP' | null }) {
  const t = useT()
  const on = useFeature('prod.page')
  if (!on) return null
  return (
    <MaterialSection
      title={t('部品の画像', 'Part images')}
      badge={<FeatureBadge id="prod.page" />}
      info={t('ボタン・バナー・ロゴ・アイコンの画像です。URL か <img> のタグ(代替テキスト・幅つき)をコピーして、HTML に貼ります。上げる・直すのは ⚙ の「画像のライブラリ」です', 'Images for buttons, banners, logos and icons. Copy the URL or the <img> tag (with alt and width) and paste it into the HTML. Upload or edit them in ⚙ Image library.')}
    >
      <PartPicker market={market} />
    </MaterialSection>
  )
}
