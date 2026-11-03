// 仕事の設定(BigQuery の表の場所・AI の設定)の、共通の見せ方: 環境変数から写したことの知らせと、変えた記録(だれ・いつ・どの項目)。
// 値そのものは記録に出さない(いまの値は欄で見る。秘密はもともと DB に入らない)
import { MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components'
import type { SettingsView } from './data/appSettings'
import { locale, useT } from './i18n'
import { typo } from './typo'

const useStyles = makeStyles({
  list: { display: 'grid', gridTemplateColumns: 'auto auto 1fr', columnGap: tokens.spacingHorizontalM, rowGap: '2px', fontSize: tokens.fontSizeBase200, alignItems: 'baseline' },
  head: { ...typo.pairLabel },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

const when = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

/** 環境変数から写したことの知らせ(写したあとは、環境変数を変えても効かないことも伝える) */
export function CopiedFromEnv({ view }: { view: SettingsView }) {
  const t = useT()
  if (!view.copiedFromEnvAt) return null
  return (
    <MessageBar intent="info" layout="multiline">
      <MessageBarBody>
        {t(
          `環境変数から写しました(${when(view.copiedFromEnvAt)})。これからは、ここで変えた値が効きます(環境変数を変えても効きません。消してかまいません)。`,
          `Copied from environment variables (${when(view.copiedFromEnvAt)}). From now on, the values set here apply (changing the environment variables has no effect; you can remove them).`,
        )}
      </MessageBarBody>
    </MessageBar>
  )
}

/** 変えた記録。label は項目の名前を画面の言葉に */
export function SettingsHistory({ view, label }: { view: SettingsView; label: (key: string) => string }) {
  const s = useStyles()
  const t = useT()
  if (!view.history.length) return <div className={s.note}>{t('まだ変えていません', 'Not changed yet')}</div>
  return (
    <div className={s.list}>
      <span className={s.head}>{t('時刻', 'Time')}</span>
      <span className={s.head}>{t('だれが', 'Who')}</span>
      <span className={s.head}>{t('変えた項目', 'Changed')}</span>
      {view.history.map((h, i) => (
        <HistoryRow key={i} at={h.at} by={h.source === 'env' ? t('環境変数から写した', 'Copied from env') : h.by} items={h.changes.map(label).join(t('・', ', ')) || t('(変わらず)', '(no change)')} />
      ))}
    </div>
  )
}

function HistoryRow({ at, by, items }: { at: string; by: string; items: string }) {
  return (
    <>
      <span>{when(at)}</span>
      <span>{by}</span>
      <span>{items}</span>
    </>
  )
}
