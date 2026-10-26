// 学びのカード 1 枚(X78)。手札・国のデッキ・配信カードの装備で、同じ部品を使う。
// 演出は入れない(利用者 2026-10-24: さりげなく)。カードの形と、強さ・使われた回数の控えめな表示だけ
import { useState, type ReactNode } from 'react'
import { Badge, Card, Link, Tag, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { day, optionLabel, useT } from './i18n'
import { typo } from './typo'
import { channelOptions, countryOptions } from './status'
import { themeTypeLabel } from './themeTypes'
import { seasonLabel, stateLabel, type LearningCardData } from './learningCards'

const useStyles = makeStyles({
  card: { display: 'grid', rowGap: '8px', alignContent: 'start', padding: '12px' },
  // 休ませた・外した・この国のデッキにない学びは、薄く(並びからは消さない)
  off: { backgroundColor: tokens.colorNeutralBackground2 },
  head: { display: 'flex', alignItems: 'flex-start', columnGap: '8px' },
  title: { ...typo.heading, flex: 1, minWidth: 0, overflowWrap: 'anywhere' },
  titleOff: { color: tokens.colorNeutralForeground3 },
  notes: {
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    padding: 0,
    textAlign: 'left',
    color: tokens.colorNeutralForeground1,
    fontFamily: 'inherit',
  },
  // 3 行まで(押すと全文)
  clamp: { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  foot: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '10px', rowGap: '4px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  dots: { letterSpacing: '1px', color: tokens.colorNeutralForeground2 },
  actions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' },
})

const countryName = (code: string) => optionLabel(countryOptions.find((o) => String(o.value) === code)?.label) || code
const channelName = (code: string) => optionLabel(channelOptions.find((o) => String(o.value) === code)?.label) || code
const pt = (v: number | null) => (v == null ? '' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}pt`)

interface Props {
  data: LearningCardData
  /** 根拠の配信を開く(配信カードの id) */
  onOpenSource?: (cardId: string) => void
  /** この学びの効き目(結果の面の「効果」の「学び」のタブ)を開く。配信カードの学びから、どう効いたかを確かめに行く */
  onOpenImpact?: (learningId: string) => void
  /** 右下の操作(手札では状態のメニュー、配信カードでは外すボタン) */
  actions?: ReactNode
  /** 小さく(配信カードの装備。名前・強さ・操作だけ) */
  compact?: boolean
  /** 足したばかりの印など(useJustAdded の freshClass) */
  className?: string
}

/** 強さの点(1〜5)。材料不足なら言葉で */
export function StrengthDots({ strength }: { strength: number | null }) {
  const s = useStyles()
  const t = useT()
  if (strength == null) return <span title={t('比べる配信が 3 本に満たないので、強さはまだ分かりません', 'Fewer than 3 deliveries to compare, so strength is not known yet')}>{t('材料不足', 'Not enough data')}</span>
  return (
    <span className={s.dots} title={t(`強さ ${strength} / 5(渡した配信と渡さなかった配信の、リフト率の差から)`, `Strength ${strength}/5 (from the lift gap between deliveries with and without it)`)} aria-label={t(`強さ ${strength} / 5`, `Strength ${strength} of 5`)}>
      {'●'.repeat(strength)}
      {'○'.repeat(5 - strength)}
    </span>
  )
}

export function LearningCard({ data: l, onOpenSource, onOpenImpact, actions, compact = false, className }: Props) {
  const s = useStyles()
  const t = useT()
  const [full, setFull] = useState(false)
  const off = l.state !== 'use' || !l.inDeck
  const badge =
    l.state !== 'use' ? (
      <Badge appearance="tint" size="small" color={l.state === 'resting' ? 'warning' : 'informative'}>
        {stateLabel(l.state)}
      </Badge>
    ) : !l.inDeck ? (
      <Badge appearance="tint" size="small" color="informative">
        {t('この国では使わない', 'Not used here')}
      </Badge>
    ) : null

  return (
    <Card size="small" className={mergeClasses(s.card, off && s.off, className)}>
      <div className={s.head}>
        <span className={mergeClasses(s.title, off && s.titleOff)}>{l.title || t('(名前なし)', '(untitled)')}</span>
        {badge}
      </div>
      {!compact && (
        <>
          <button type="button" className={mergeClasses(s.notes, !full && s.clamp)} onClick={() => setFull(!full)} title={full ? undefined : t('押すと全文', 'Click for the full text')}>
            {l.notes}
          </button>
          <div className={s.tags} aria-label={t('効く条件', 'Where it applies')}>
            {[countryName(l.origin), channelName(l.channel), themeTypeLabel(l.themeType), l.season ? seasonLabel(l.season) : '']
              .filter(Boolean)
              .map((x) => (
                <Tag key={x} size="extra-small" appearance="outline">
                  {x}
                </Tag>
              ))}
          </div>
        </>
      )}
      <div className={s.foot}>
        <StrengthDots strength={l.strength} />
        {!compact && l.lift.diff != null && <span title={t('渡した配信と渡さなかった配信の、リフト率の差', 'Lift gap between deliveries with and without it')}>{pt(l.lift.diff)}</span>}
        <span>{t(`使われた ${l.uses} 本`, `Used ${l.uses}×`)}</span>
        {!compact && l.lastUsed && <span>{t(`最後 ${day(l.lastUsed)}`, `Last ${day(l.lastUsed)}`)}</span>}
        {!compact &&
          (onOpenSource ? (
            <Link as="button" onClick={() => onOpenSource(l.source.id)} title={t(`元の配信「${l.source.name ?? ''}」の結果を開く`, `Open the results of "${l.source.name ?? ''}"`)}>
              {t('根拠 1 本', '1 source')}
            </Link>
          ) : (
            <span title={l.source.name ?? ''}>{t('根拠 1 本', '1 source')}</span>
          ))}
        {!compact && onOpenImpact && (
          <Link as="button" onClick={() => onOpenImpact(l.id)} title={t('結果の「効果」で、この学びを渡した配信と渡さなかった配信を比べた詳しい所を開く', 'Open the comparison of deliveries with and without this learning in Results > Impact')}>
            {t('効き目を見る', 'See impact')}
          </Link>
        )}
        {actions && <span className={s.actions}>{actions}</span>}
      </div>
    </Card>
  )
}
