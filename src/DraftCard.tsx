import { Button, Checkbox, Input, ProgressBar, Select, Spinner, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowClockwiseRegular, DeleteRegular, LockClosedRegular, MailRegular, PhoneRegular, WarningFilled } from '@fluentui/react-icons'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { optionLabel, useT } from './i18n'
import { DeliveryPeek } from './DeliveryPeek'
import { heroImage } from './images'
import { CHANNEL_PUSH, departmentOptions } from './status'
import { draftCard, draftName, draftProductIds, type Draft } from './bulkDraft'
import type { BulkDrafts } from './useBulkDrafts'

// 週の列に並べる、下書きの札。保存済みの配信(実線)と、形で見分けられるように、破線の枠と「下書き」の印を付ける
// (色はステータスの意味を持つので、新しい色は足さない)
const useStyles = makeStyles({
  card: {
    flexShrink: 0,
    display: 'grid',
    rowGap: '5px',
    padding: '6px 8px 8px',
    textAlign: 'left',
    borderRadius: tokens.borderRadiusMedium,
    border: `1.5px dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    cursor: 'pointer',
    minWidth: 0,
  },
  cardPush: { borderRadius: '16px' },
  cardOn: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '1px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0, fontSize: tokens.fontSizeBase100, color: tokens.colorBrandForeground1 },
  tag: { flexShrink: 0, padding: '0 4px', borderRadius: tokens.borderRadiusSmall, border: `1px dashed ${tokens.colorBrandStroke1}`, fontSize: '10px', lineHeight: '14px' },
  time: { minWidth: 0, flexGrow: 1 },
  input: { minWidth: 0, width: '100%' },
  status: { display: 'flex', alignItems: 'center', columnGap: '4px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground2, minWidth: 0 },
  text: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  name: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  sub: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hint: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hero: { width: '100%', aspectRatio: '16 / 9', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3, overflow: 'hidden' },
  img: { display: 'block', width: '100%', height: '100%', objectFit: 'contain' },
  error: { color: tokens.colorPaletteRedForeground1 },
  lock: { color: tokens.colorPaletteDarkOrangeForeground1, whiteSpace: 'normal' },
})

interface Props {
  draft: Draft
  bulk: BulkDrafts
  products: Product[]
  heroes: HeroImage[]
}

/**
 * 下書き 1 本の札。まだ作っていないときは、時刻・種別・テーマのヒントを入れられる。
 * できたら、テーマ・メイン画像・商品の数を出し、押すと右の引き出しで中身を見る(マウスを重ねるとプレビュー)
 */
export function DraftCard({ draft: d, bulk, products, heroes }: Props) {
  const s = useStyles()
  const t = useT()
  const isPush = d.channel === CHANNEL_PUSH
  const editable = !bulk.running && (d.state === 'idle' || d.state === 'failed')
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const lock = bulk.locked(d)
  const time = d.scheduledAt.slice(11, 16)
  const setTime = (v: string) => v && bulk.patch(d.key, { scheduledAt: `${d.scheduledAt.slice(0, 10)}T${v}` })

  const body = () => {
    if (lock) {
      return (
        <div className={mergeClasses(s.status, s.lock)}>
          <LockClosedRegular />
          {t('確定した週には作れません', 'Cannot create in a confirmed week')}
        </div>
      )
    }
    if (d.state === 'running') {
      return (
        <>
          <div className={s.status}>
            <Spinner size="extra-tiny" />
            <span className={s.text}>{d.step}</span>
          </div>
          <ProgressBar value={d.total ? (d.done ?? 0) / d.total : 0} thickness="medium" />
        </>
      )
    }
    if (d.state === 'done' && d.result) {
      const hero = heroImage(heroes.find((h) => h.id === d.result?.hero?.hero?.heroId))
      const n = draftProductIds(d).length
      return (
        <>
          <div className={s.status}>
            <Checkbox size="medium" checked={!!d.checked} onChange={(_, v) => bulk.patch(d.key, { checked: !!v.checked })} onClick={stop} aria-label={t('保存の対象にする', 'Include in save')} />
            <span className={mergeClasses(s.text, s.name)} title={draftName(d)}>{draftName(d)}</span>
            {d.error && (
              <Tooltip content={t(`一部の工程で失敗しました: ${d.error}`, `Some steps failed: ${d.error}`)} relationship="label">
                <WarningFilled color={tokens.colorPaletteDarkOrangeForeground1} />
              </Tooltip>
            )}
          </div>
          {d.result.headline && <span className={s.sub} title={d.result.headline}>{d.result.headline}</span>}
          {hero && (
            <div className={s.hero}>
              <img className={s.img} src={hero} alt="" draggable={false} />
            </div>
          )}
          <div className={s.status}>
            <span className={s.text}>{isPush ? (d.result.pushTitle ?? '') : t(`商品 ${n}`, `${n} products`)}</span>
            <Tooltip content={t('この下書きを作り直す', 'Recreate this draft')} relationship="label">
              <Button size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} disabled={bulk.running} onClick={(e) => { stop(e); void bulk.generate([d.key]) }} />
            </Tooltip>
          </div>
          {d.hint && <span className={s.hint}>{t(`ヒント: ${d.hint}`, `Hint: ${d.hint}`)}</span>}
        </>
      )
    }
    return (
      <>
        <Select size="small" className={s.input} value={d.department} disabled={!editable} onChange={(_, v) => bulk.patch(d.key, { department: v.value })} onClick={stop} aria-label={t('種別', 'Type')}>
          <option value="">{t('種別: 未設定', 'Type: not set')}</option>
          {departmentOptions.map((o) => (
            <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
          ))}
        </Select>
        {/* テーマのヒント(空なら AI に任せる)。AI がテーマを考えるときに、いちばん優先する */}
        <Input
          size="small"
          className={s.input}
          value={d.hint ?? ''}
          disabled={!editable}
          placeholder={t('テーマのヒント(任意)', 'Theme hint (optional)')}
          title={t('例: 雨の日・新作ニット', 'e.g. rainy days, new knits')}
          onChange={(_, v) => bulk.patch(d.key, { hint: v.value })}
          onClick={stop}
          aria-label={t('テーマのヒント', 'Theme hint')}
        />
        {d.state === 'failed' ? (
          <div className={mergeClasses(s.status, s.error)}>
            <span className={s.text} title={d.error}>{t(`失敗: ${d.error ?? ''}`, `Failed: ${d.error ?? ''}`)}</span>
            <Button size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} disabled={bulk.running} onClick={(e) => { stop(e); void bulk.generate([d.key]) }}>
              {t('やり直す', 'Retry')}
            </Button>
          </div>
        ) : (
          <span className={s.hint}>{t('未作成', 'Not created yet')}</span>
        )}
      </>
    )
  }

  const el = (
    <div
      role="button"
      tabIndex={0}
      className={mergeClasses(s.card, isPush && s.cardPush, d.key === bulk.selectedKey && s.cardOn)}
      onClick={() => bulk.select(d.key)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) bulk.select(d.key)
      }}
    >
      <div className={s.head}>
        {isPush ? <PhoneRegular /> : <MailRegular />}
        <span className={s.tag}>{t('下書き', 'Draft')}</span>
        <Input
          className={s.time}
          size="small"
          type="time"
          appearance="underline"
          value={time}
          disabled={d.state === 'running' || bulk.running}
          onChange={(_, v) => setTime(v.value)}
          onClick={stop}
          aria-label={t('配信の時刻', 'Send time')}
        />
        <Tooltip content={t('この下書きを消す', 'Remove this draft')} relationship="label">
          <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={d.state === 'running'} onClick={(e) => { stop(e); bulk.remove(d) }} />
        </Tooltip>
      </div>
      {body()}
    </div>
  )
  // 中身ができているものだけ、マウスを重ねるとプレビューを出す
  return d.state === 'done' ? (
    <DeliveryPeek card={draftCard(d, products)} productIds={draftProductIds(d)} products={products} heroes={heroes}>
      {el}
    </DeliveryPeek>
  ) : (
    el
  )
}
