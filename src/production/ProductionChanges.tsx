// 「企画から変えた所」の一覧(P17・P19・P20。2026-11-02 Plan と Production のシンプル版を仕上げる)。
// 企画で承認された写しと、制作が直した写しを比べ、変えた所を 1 行ずつ(企画の値に線を引いて、いまの値と並べる)。
// 企画の担当が「どこを直されたか」を一度に見るため。左のバーの「変更」のパネルに差し込む想定(差し込むのは制作の画面の側)。
// 行を押すとその部品を選び(onSelect)、行ごとに企画の値へ戻せ(↶)、上の「すべて企画の値に戻す」でまとめて戻せる。だれがいつ直したかも上に出す
import { Button, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowResetRegular, ArrowUndoRegular } from '@fluentui/react-icons'
import type { Snapshot } from '../productionSnapshot'
import { snapshotChanges, type ChangeRow } from './changeRows'
import { useT, when } from '../i18n'
import { typo } from '../typo'
import { emptyValueText } from '../emptyValue'
import { useFeature } from '../featureFlags'
import { FeatureBadge } from '../FeatureBadge'
import { confirmDialog } from '../confirm'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  who: { ...typo.caption, flexGrow: 1, minWidth: 0 },
  list: { display: 'grid', rowGap: '4px', minWidth: 0 },
  // 行。左に色の線(詳しい制作の画面の「企画から変更」の行と同じ印)
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    columnGap: '6px',
    alignItems: 'start',
    padding: '6px 8px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `3px solid ${tokens.colorPaletteDarkOrangeBorderActive}`,
    minWidth: 0,
  },
  pickable: { cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  body: { display: 'grid', rowGap: '2px', minWidth: 0 },
  label: typo.pairLabel,
  now: { ...typo.value, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  // 企画の値(線を引く)
  was: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, textDecorationLine: 'line-through', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  empty: typo.empty,
  pair: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  // 画像は切らずに全景
  img: { width: '64px', height: '40px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  imgWas: { opacity: 0.6 },
  caption: typo.caption,
})

interface Props {
  /** 企画で承認された写し */
  original: Snapshot
  /** いまの写し(制作が直したもの) */
  current: Snapshot
  /** 直した人・日時(制作の依頼の edited_by_name・edited_at) */
  editedBy?: string | null
  editedAt?: string | null
  /** 戻せるか(依頼したあとの、生きている版で、直す人だけ) */
  editable?: boolean
  /** 1 行を戻した写し・まとめて戻した写しを渡す(保存は呼ぶ側) */
  onChange?: (next: Snapshot) => void
  /** 行を押したとき(その部品を選ぶ) */
  onSelect?: (row: ChangeRow) => void
}

export function ProductionChanges({ original, current, editedBy, editedAt, editable = false, onChange, onSelect }: Props) {
  const s = useStyles()
  const t = useT()
  const on = useFeature('prod.page')
  if (!on) return null
  const rows = snapshotChanges(original, current)
  const canRevert = editable && !!onChange
  const value = (v: string, cls: string) => (v.trim() ? <span className={cls}>{v}</span> : <span className={s.empty}>{emptyValueText('none')}</span>)

  const revertAll = async () => {
    if (!onChange) return
    if (!(await confirmDialog(t(`企画から変えた ${rows.length} か所を、すべて企画の値に戻します。よいですか?`, `Revert all ${rows.length} changes to the plan?`), { okLabel: t('戻す', 'Revert') }))) return
    onChange(original)
  }

  return (
    <div className={s.root}>
      <div className={s.head}>
        <span className={s.who}>
          {rows.length === 0
            ? t('企画から変えた所はありません', 'Nothing changed from the plan')
            : editedBy
              ? t(`${rows.length} か所 ・ 直した: ${editedBy} ${when(editedAt)}`, `${rows.length} changes · edited by ${editedBy} ${when(editedAt)}`)
              : t(`${rows.length} か所`, `${rows.length} changes`)}
        </span>
        <FeatureBadge id="prod.page" />
        {canRevert && rows.length > 0 && (
          <Tooltip content={t('すべて企画の値に戻す', 'Revert everything to the plan')} relationship="label">
            <Button size="small" appearance="subtle" icon={<ArrowResetRegular />} onClick={() => void revertAll()} />
          </Tooltip>
        )}
      </div>
      {rows.length > 0 && (
        <div className={s.list}>
          {rows.map((r) => (
            <div key={r.id} className={mergeClasses(s.row, onSelect && s.pickable)} onClick={onSelect ? () => onSelect(r) : undefined}>
              <span className={s.body}>
                <span className={s.label}>{r.label}</span>
                {r.beforeImage || r.afterImage ? (
                  <span className={s.pair}>
                    {r.beforeImage ? <img className={mergeClasses(s.img, s.imgWas)} src={r.beforeImage} alt="" /> : null}
                    →
                    {r.afterImage ? <img className={s.img} src={r.afterImage} alt="" /> : null}
                  </span>
                ) : null}
                {value(r.after, s.now)}
                {value(r.before, s.was)}
              </span>
              {canRevert && (
                <Tooltip content={t('企画の値に戻す', 'Revert to the plan')} relationship="label">
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<ArrowUndoRegular />}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onChange?.(r.revert(current))
                    }}
                  />
                </Tooltip>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
