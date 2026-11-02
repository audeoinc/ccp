// 渡されたものの「AB テスト」の欄(P40。2026-11-02 Plan と Production のシンプル版を仕上げる)。
// 制作は、案ごとの違い(メイン画像・見出し・商品)と計測の決まり(案ごとの utm_campaign)を知らないと作れないので、AB の配信のときだけ出す。
// 詳しい制作の画面(2026-11-02 に消した)の AB の欄と同じ中身を、シンプルの見た目(見出し 13px・LabeledValue・行ごとのコピー)で出す。
// 見るだけ(案の中身を直すのは配信カード)。シンプルな制作の画面の「渡された」のパネルに差し込む
import { InfoLabel, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components'
import { linkRows, productRows, rowsText, variantSnapshot, variantUtmCampaign, type Snapshot, type SnapshotVariant } from '../productionSnapshot'
import { heroImage } from '../images'
import { useT } from '../i18n'
import { typo } from '../typo'
import { CopyButton } from '../CopyButton'
import { LabeledValue } from '../LabeledValue'
import { useFeature } from '../featureFlags'
import { FeatureBadge } from '../FeatureBadge'

const useStyles = makeStyles({
  section: { display: 'grid', rowGap: '6px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  title: { ...typo.heading, flexGrow: 1, minWidth: 0 },
  list: { display: 'grid', rowGap: '4px', minWidth: 0 },
  // 1 案 = 1 行(メイン画像・中身・この案のリンクをコピー)。行の形は制作の材料の行(MaterialRows)と同じ
  row: { display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', columnGap: '8px', alignItems: 'start', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  // メイン画像は切らずに全景(画像は切らない決まり)。ない案は同じ幅の空き
  hero: { width: '64px', height: '40px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  body: { display: 'grid', rowGap: '2px', minWidth: 0 },
  name: typo.valueStrong,
  summary: { ...typo.value, whiteSpace: 'pre-line', overflowWrap: 'anywhere' },
  caption: typo.caption,
})

/** AB テストの欄。AB の配信でなければ、何も出さない */
export function AbHandoffSection({ snapshot }: { snapshot: Snapshot }) {
  const s = useStyles()
  const t = useT()
  // AB テスト(card.abtest)と、案から選ぶ(card.variants)は別の機能。その配信の種類の機能が非公開なら出さない(X87)
  const abTestOn = useFeature('card.abtest')
  const variantsOn = useFeature('card.variants')
  const ab = snapshot.ab
  if (!ab || !(ab.choose ? variantsOn : abTestOn)) return null
  const productName = (id: string) => snapshot.products.find((p) => p.id === id)?.name ?? ''
  // A 案は、写しそのもの(テキスト・メイン画像・商品)
  const all: SnapshotVariant[] = [{ key: 'A', productIds: snapshot.productIds, hero: snapshot.hero } as SnapshotVariant, ...ab.variants]
  const rows = all.map((v) => {
    // 案ごとの計測用のパラメーター(utm_campaign の末尾に案。X55)。その案のリンク・商品の URL を、まとめて写せる
    const vs = variantSnapshot(snapshot, v)
    const urls = [...linkRows(vs, v.key), ...productRows(vs, v.key).map((r) => ({ label: r.product.name, value: r.url }))].filter((r) => r.value)
    return { v, campaign: variantUtmCampaign(snapshot, v.key), urls }
  })
  const allText = [ab.summary, ...rows.map((r) => `${r.v.key}: ${r.v.productIds.map(productName).join(' / ')}${ab.choose ? '' : ` (utm_campaign: ${r.campaign})`}`)].join('\n')
  return (
    <div className={s.section}>
      <div className={s.head}>
        <InfoLabel
          className={s.title}
          size="small"
          info={t('A 案は、渡されたテキスト・メイン画像・商品そのものです。B・C 案の中身を直すときは、配信カードで直します', 'Variant A is the text, image and products handed off. Edit variants B and C in the delivery card.')}
        >
          {ab.choose ? t('案から選ぶ', 'Choose a variant') : t('AB テスト', 'A/B test')}
        </InfoLabel>
        <FeatureBadge id={ab.choose ? 'card.variants' : 'card.abtest'} />
        <CopyButton text={allText} label={t('AB テストの中身をすべてコピー', 'Copy the whole A/B test')} />
      </div>
      <span className={s.summary}>{ab.summary}</span>
      {ab.choose && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>
            {t('案から選ぶ配信で、まだ 1 案に決まっていません。配信カードで「この案に決める」を押して保存するまで、制作に渡せません', 'This delivery is still choosing between variants. You can hand off to production after choosing one in the delivery card and saving.')}
          </MessageBarBody>
        </MessageBar>
      )}
      <div className={s.list}>
        {rows.map(({ v, campaign, urls }) => (
          <div key={v.key} className={s.row}>
            {v.hero ? <img className={s.hero} src={heroImage(v.hero) ?? ''} alt="" /> : <span />}
            <span className={s.body}>
              <span className={s.name}>{t(`${v.key} 案`, `Variant ${v.key}`)}</span>
              {'texts' in v && v.texts && <LabeledValue label={t('見出し', 'Headline')}>{v.texts.headline}</LabeledValue>}
              <LabeledValue label={t('商品', 'Products')} empty="none">
                {v.productIds.map(productName).filter(Boolean).join(' / ')}
              </LabeledValue>
              {!ab.choose && (
                // 値は長いので、ラベルの下に行の幅いっぱいで折り返す(狭いパネルで 1 文字ずつ折れないように)
                <LabeledValue label="utm_campaign" layout="stacked" copy>
                  {campaign}
                </LabeledValue>
              )}
            </span>
            <CopyButton text={rowsText(urls)} label={t('この案のリンクをコピー', 'Copy this variant’s links')} />
          </div>
        ))}
      </div>
      {!ab.choose && (
        <span className={s.caption}>
          {t(
            '計測: 案ごとに utm_campaign の末尾が -a・-b・-c になります(配信システムには、案ごとのリンクを設定してください)。勝ち案を残りに送ると、残り分も同じリンクのまま送られるので、GA の案ごとの数字には、勝ち案にだけ残り分が混ざります。勝ち負けは、配信システムのテスト分の数字で見ます',
            'Tracking: utm_campaign ends in -a, -b or -c per variant (set each variant’s links in the delivery system). The rollout to the rest reuses the winner’s links, so in GA only the winner’s numbers include the rollout. Judge the winner by the delivery system’s test-group numbers.',
          )}
        </span>
      )}
    </div>
  )
}
