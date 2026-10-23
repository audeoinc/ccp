import { Button, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components'
import { bytesLabel, type ColumnProfile } from './api'
import { CopyButton } from './CopyButton'
import { pct, profileMarkdown } from './format'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '6px' },
  row: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  title: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, fontFamily: tokens.fontFamilyMonospace, flexGrow: 1 },
  facts: { display: 'flex', flexWrap: 'wrap', columnGap: '14px', rowGap: '2px', fontSize: tokens.fontSizeBase200 },
  key: { color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightSemibold, marginRight: '4px' },
  bars: { display: 'grid', gridTemplateColumns: 'minmax(80px, max-content) minmax(0, 1fr) max-content', columnGap: '8px', rowGap: '2px', alignItems: 'center', fontSize: tokens.fontSizeBase200 },
  value: { fontFamily: tokens.fontFamilyMonospace, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' },
  track: { height: '10px', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusSmall, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: tokens.colorBrandBackground },
  n: { color: tokens.colorNeutralForeground3, textAlign: 'right' },
  null: { color: tokens.colorNeutralForeground4, fontStyle: 'italic' },
  muted: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

interface Props {
  profile: ColumnProfile
  /** 読む量が多いときに、確かめて流す */
  onConfirm: () => void
  /** AI に聞く(この列の中身を会話に送る) */
  onAsk?: (text: string) => void
}

/** 列の中身(行数・空・値の種類・最小・最大・よく出る値の上位)。CCP の列に当てる前に、値の形を見る */
export function ColumnProfileView({ profile: p, onConfirm, onAsk }: Props) {
  const s = useStyles()
  if (p.needs_confirm) {
    return (
      <MessageBar intent="warning" layout="multiline">
        <MessageBarBody>
          {p.column} を調べると、{bytesLabel(p.bytes)} 読みます(概算 ${p.cost_usd?.toFixed(2)})。
          <div className={s.row} style={{ marginTop: '4px' }}>
            <Button size="small" appearance="primary" onClick={onConfirm}>
              流して調べる
            </Button>
            <span className={s.muted}>期間で絞りたいときは、SQL の欄で WHERE を付けて流してください</span>
          </div>
        </MessageBarBody>
      </MessageBar>
    )
  }
  const max = Math.max(1, ...(p.top ?? []).map((t) => t.n))
  return (
    <div className={s.root}>
      <div className={s.row}>
        <span className={s.title}>{p.column}</span>
        <span className={s.muted}>
          {p.type}・読んだ量 {bytesLabel(p.bytes)}・{p.seconds} 秒
        </span>
        <CopyButton label="Markdown でコピー" text={() => profileMarkdown(p)} />
        {onAsk && (
          <Button size="small" onClick={() => onAsk(`この列を、CCP のどの列に当てるとよさそうか考えてください。変換が要るなら、その書き方も。\n\n${profileMarkdown(p)}`)}>
            AI に聞く
          </Button>
        )}
      </div>
      <div className={s.facts}>
        <span>
          <span className={s.key}>行数</span>
          {p.total?.toLocaleString() ?? '—'}
        </span>
        <span>
          <span className={s.key}>空</span>
          {p.nulls?.toLocaleString() ?? '—'}({pct(p.null_rate)})
        </span>
        {p.distinct_approx != null && (
          <span>
            <span className={s.key}>値の種類(近似)</span>
            {p.distinct_approx.toLocaleString()}
          </span>
        )}
        {p.min_value != null && (
          <span>
            <span className={s.key}>最小</span>
            {p.min_value}
          </span>
        )}
        {p.max_value != null && (
          <span>
            <span className={s.key}>最大</span>
            {p.max_value}
          </span>
        )}
        {p.min_len != null && (
          <span>
            <span className={s.key}>文字の長さ</span>
            {p.min_len}〜{p.max_len}
          </span>
        )}
      </div>
      {p.top && p.top.length > 0 && (
        <>
          <span className={s.muted}>よく出る値(上位 {p.top.length})</span>
          <div className={s.bars}>
            {p.top.map((t, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <span className={s.value} title={t.value ?? 'NULL'}>
                  {t.value == null ? <span className={s.null}>NULL</span> : t.value}
                </span>
                <div className={s.track}>
                  <div className={s.fill} style={{ width: `${(t.n / max) * 100}%` }} />
                </div>
                <span className={s.n}>{t.n.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {!p.top?.length && <span className={s.muted}>この型(JSON・GEOGRAPHY など)は、よく出る値を数えません</span>}
    </div>
  )
}
