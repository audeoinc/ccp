import { Button, Input, Select, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, BeakerRegular, CheckmarkCircleRegular, DismissRegular, SplitVerticalRegular } from '@fluentui/react-icons'
import { AiIcon } from './AiMark'
import { allVariants, isChoose, metricLabel, nextVariant, splitOf, targetLabel, type AbDecision, type AbMetric, type AbMode, type AbPurpose, type AbTarget, type AbTest, type VariantKey } from './abTest'
import { useT } from './i18n'
import { confirmDialog } from './confirm'

const useStyles = makeStyles({
  bar: {
    display: 'grid',
    rowGap: '6px',
    margin: '0 24px 8px',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '8px', rowGap: '4px' },
  title: { display: 'inline-flex', alignItems: 'center', columnGap: '4px', fontWeight: tokens.fontWeightSemibold },
  tabs: { display: 'inline-flex', columnGap: '4px' },
  tab: { minWidth: '64px' },
  remove: { minWidth: 'auto', marginLeft: '-6px' },
  grow: { flexGrow: 1 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  label: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  chip: { minWidth: 'auto', height: '24px', padding: '0 10px', fontWeight: tokens.fontWeightRegular },
  num: { width: '64px' },
  hypo: { flexGrow: 1, minWidth: '240px' },
})

interface Props {
  ab: AbTest
  active: VariantKey
  onSwitch: (k: VariantKey) => void
  onChange: (ab: AbTest) => void
  onAdd: () => void
  onRemove: (k: VariantKey) => void
  onStop: () => void
  /** 比べる要素を変える(案の中身の持ち方が変わるので、配信カードの側で A に戻してから変える) */
  onTarget: (t: AbTarget) => void
  /** いまの案(B・C)を、A と違う切り口で AI に作らせる */
  onAiDraft: () => void
  aiBusy: boolean
  /** 案をプレビューで並べて比べる */
  onCompare: () => void
  /** 案から選ぶ(X57): この案に決める */
  onDecide: (k: VariantKey) => void
}

/**
 * AB テストの帯(X55)。配信カードの題名の下に出す。
 * 1 行目: 案の切り替え(A・B・C。押した案を、中ペイン・プレビュー・商品情報で編集する)と、いま編集している案の説明。
 * 2 行目: テストの設定(比べる要素・指標・送り方・仮説)
 */
export function AbTestBar({ ab, active, onSwitch, onChange, onAdd, onRemove, onStop, onTarget, onAiDraft, aiBusy, onCompare, onDecide }: Props) {
  const s = useStyles()
  const t = useT()
  const keys = allVariants(ab)
  const split = splitOf(ab)
  const canAdd = !!nextVariant(ab)
  const set = <K extends keyof AbTest>(k: K, v: AbTest[K]) => onChange({ ...ab, [k]: v })
  const choose = isChoose(ab)
  const title = choose ? t('案から選ぶ', 'Choose a variant') : t('AB テスト', 'A/B test')
  return (
    <div className={s.bar} role="region" aria-label={title}>
      <div className={s.row}>
        <span className={s.title}>
          <BeakerRegular />
          {title}
        </span>
        <span className={s.tabs} role="tablist" aria-label={t('案', 'Variants')}>
          {keys.map((k) => (
            <span key={k} className={s.tabs}>
              <Button
                type="button"
                size="small"
                role="tab"
                aria-selected={k === active}
                appearance={k === active ? 'primary' : 'secondary'}
                className={s.tab}
                onClick={() => onSwitch(k)}
                title={t(`${k} 案を編集する(配分 ${split[k]}%)`, `Edit variant ${k} (${split[k]}%)`)}
              >
                {t(`${k} 案`, `Variant ${k}`)}
              </Button>
              {k !== 'A' && (
                <Button
                  type="button"
                  size="small"
                  appearance="subtle"
                  className={s.remove}
                  icon={<DismissRegular />}
                  aria-label={t(`${k} 案を外す`, `Remove variant ${k}`)}
                  title={t(`${k} 案を外す`, `Remove variant ${k}`)}
                  onClick={async () => {
                    if (await confirmDialog(t(`${k} 案を外します。${k} 案だけのメイン画像・商品は消えます(保存で確定)。よろしいですか?`, `Remove variant ${k}? Its own hero image and products will be discarded (on save).`))) onRemove(k)
                  }}
                />
              )}
            </span>
          ))}
          {canAdd && (
            <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} onClick={onAdd} title={t('A 案の写しから、新しい案を作ります', 'Create a new variant as a copy of A')}>
              {t('案を足す', 'Add a variant')}
            </Button>
          )}
        </span>
        <span className={mergeClasses(s.note, s.grow)}>
          {choose
            ? t(`${active} 案を編集中。${targetLabel(ab.target)}は案ごと、それ以外は全案で共通。決めた 1 案だけを配信します`, `Editing variant ${active}. Each variant has its own ${targetLabel(ab.target).toLowerCase()}; the rest is shared. Only the variant you choose is sent.`)
            : active === 'A'
            ? t(`A 案(いまの配信そのもの)を編集中。${targetLabel(ab.target)}は案ごと、それ以外は全案で共通です`, `Editing variant A (the delivery itself). Each variant has its own ${targetLabel(ab.target).toLowerCase()}; everything else is shared.`)
            : t(`${active} 案を編集中。${targetLabel(ab.target)}は ${active} 案だけのもの。それ以外(テーマ・コピー・リンク先など)を直すと、全案に効きます`, `Editing variant ${active}. It has its own ${targetLabel(ab.target).toLowerCase()}; other fields (theme, copy, links…) are shared by all variants.`)}
        </span>
        {choose && (
          <Button
            type="button"
            size="small"
            appearance="primary"
            icon={<CheckmarkCircleRegular />}
            onClick={() => onDecide(active)}
            title={t(`${active} 案に決めて、ほかの案は配信しない案として残します(誰でも決められます。保存で確定)`, `Go with variant ${active}; the others are kept as variants not sent (anyone can decide; on save).`)}
          >
            {t(`${active} 案に決める`, `Go with ${active}`)}
          </Button>
        )}
        {active !== 'A' && (
          <Button
            type="button"
            size="small"
            appearance="secondary"
            icon={aiBusy ? <Spinner size="extra-tiny" /> : <AiIcon size={16} />}
            disabled={aiBusy}
            onClick={onAiDraft}
            title={t(`A 案と違う切り口の${targetLabel(ab.target)}を、AI が作ります(仮説があれば、それを確かめられる案に)。いまの ${active} 案の${targetLabel(ab.target)}は置き換わります(保存で確定)`, `AI drafts a ${targetLabel(ab.target).toLowerCase()} with a different angle from A (testing the hypothesis if any). Replaces variant ${active}'s current one (on save).`)}
          >
            {aiBusy ? t('AI が作っています', 'AI is drafting') : t(`${active} 案を AI で作る`, `Draft variant ${active} with AI`)}
          </Button>
        )}
        <Button type="button" size="small" appearance="secondary" icon={<SplitVerticalRegular />} onClick={onCompare} title={t('案のプレビューを横に並べて比べます', 'Show the variant previews side by side')}>
          {t('並べて比べる', 'Compare side by side')}
        </Button>
        <Button
          type="button"
          size="small"
          appearance="subtle"
          onClick={async () => {
            if (await confirmDialog(t('案をやめて、A 案だけに戻します。B・C 案は消えます(保存で確定)。よろしいですか?', 'Stop and keep only variant A? Variants B and C will be discarded (on save).'))) onStop()
          }}
        >
          {choose ? t('案をやめる', 'Stop') : t('AB テストをやめる', 'Stop A/B test')}
        </Button>
      </div>
      <div className={s.row}>
        <span className={s.label}>{t('使い方', 'Use')}</span>
        {(['test', 'choose'] as AbPurpose[]).map((x) => (
          <Button
            key={x}
            type="button"
            size="small"
            shape="circular"
            className={s.chip}
            appearance={(ab.purpose ?? 'test') === x ? 'primary' : 'outline'}
            onClick={() => onChange({ ...ab, purpose: x })}
            title={x === 'test' ? t('全案を、受信者を分けて送り、結果で比べます', 'Send all variants to split recipients and compare results') : t('案を作って比べ、決めた 1 案だけを送ります', 'Make variants, compare them and send only the one you choose')}
          >
            {x === 'test' ? t('AB テスト(全案を送る)', 'A/B test (send all)') : t('案から選ぶ(1 案だけ送る)', 'Choose one (send one)')}
          </Button>
        ))}
        <span className={s.label}>{choose ? t('案ごとに変える', 'Per variant') : t('比べる', 'Compare')}</span>
        {(['subject', 'hero', 'products', 'both', 'all'] as AbTarget[]).map((x) => (
          <Button key={x} type="button" size="small" shape="circular" className={s.chip} appearance={ab.target === x ? 'primary' : 'outline'} onClick={() => ab.target !== x && onTarget(x)}>
            {targetLabel(x)}
          </Button>
        ))}
        {!choose && (
          <>
        <span className={s.label}>{t('判定', 'Judge by')}</span>
        <Select size="small" value={ab.metric} onChange={(_, d) => set('metric', d.value as AbMetric)} aria-label={t('判定の指標', 'Metric')}>
          {(['ctr', 'rpr', 'cvr', 'open'] as AbMetric[]).map((m) => (
            <option key={m} value={m}>{metricLabel(m)}</option>
          ))}
        </Select>
        <span className={s.label}>{t('送り方', 'Send')}</span>
        <Select size="small" value={ab.mode} onChange={(_, d) => set('mode', d.value as AbMode)} aria-label={t('送り方', 'How to send')}>
          <option value="winner">{t('一部に送り、勝った案を残りに', 'Test group, then winner to the rest')}</option>
          <option value="even">{t('全員を均等に分ける', 'Split everyone evenly')}</option>
        </Select>
        {ab.mode === 'winner' && (
          <>
            <span className={s.label}>{t('テスト', 'Test')}</span>
            <Input
              size="small"
              type="number"
              className={s.num}
              min={5}
              max={90}
              value={String(ab.testShare)}
              onChange={(_, d) => set('testShare', Math.max(5, Math.min(90, Number(d.value) || 0)))}
              contentAfter="%"
              aria-label={t('テストに回す割合', 'Test share')}
            />
            <span className={s.label}>{t('判定まで', 'Decide after')}</span>
            <Input
              size="small"
              type="number"
              className={s.num}
              min={1}
              max={72}
              value={String(ab.waitHours)}
              onChange={(_, d) => set('waitHours', Math.max(1, Math.min(72, Number(d.value) || 0)))}
              contentAfter={t('時間', 'h')}
              aria-label={t('勝ち負けを決めるまでの時間', 'Hours before choosing the winner')}
            />
          </>
        )}
        <span className={s.note}>{keys.map((k) => `${k} ${split[k]}%`).join(' / ')}{ab.mode === 'winner' ? t(` ・ 残り ${100 - ab.testShare}% に勝った案`, ` · winner to the remaining ${100 - ab.testShare}%`) : ''}</span>
          </>
        )}
      </div>
      {!choose && (
      <div className={s.row}>
        <span className={s.label}>{t('仮説', 'Hypothesis')}</span>
        <Input
          size="small"
          className={s.hypo}
          value={ab.hypothesis}
          onChange={(_, d) => set('hypothesis', d.value)}
          placeholder={t('例: 着用画像のほうが、商品だけの画像よりクリックされる', 'e.g. A lifestyle photo gets more clicks than a product-only shot')}
        />
      </div>
      )}
    </div>
  )
}

/**
 * 案から選んだあとの帯(X57)。どの案に決めたかと、配信しなかった案(中身ごと残してある)を見る入り口
 */
export function AbDecidedBar({ decision, onView }: { decision: AbDecision; onView: () => void }) {
  const s = useStyles()
  const t = useT()
  const others = decision.rejected.map((r) => r.key)
  const when = new Date(decision.at).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <div className={s.bar} role="region" aria-label={t('案から選んだ結果', 'Chosen variant')}>
      <div className={s.row}>
        <span className={s.title}>
          <CheckmarkCircleRegular />
          {t(`${decision.variant} 案に決めて配信`, `Sending variant ${decision.variant}`)}
        </span>
        <span className={mergeClasses(s.note, s.grow)}>
          {t(
            `${when}${decision.by ? `・${decision.by}` : ''}。${others.join('・')} 案は配信しませんでした(中身は残してあります)。いまの配信の中身が ${decision.variant} 案です`,
            `${when}${decision.by ? ` · ${decision.by}` : ''}. ${others.length === 1 ? `Variant ${others[0]} was` : `Variants ${others.join(', ')} were`} not sent (kept for reference). The current content is variant ${decision.variant}.`,
          )}
        </span>
        <Button type="button" size="small" appearance="secondary" icon={<SplitVerticalRegular />} onClick={onView}>
          {t('配信しなかった案も並べて見る', 'Compare with variants not sent')}
        </Button>
      </div>
    </div>
  )
}
