import { useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Select,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { DEFAULT_ALERT_SETTINGS, setAlertSettings, type AlertSettings } from './alertSettings'
import { useT } from './i18n'
import { THEME_TYPES, themeTypeLabel } from './themeTypes'

const useStyles = makeStyles({
  body: { display: 'grid', rowGap: '16px' },
  group: { display: 'grid', rowGap: '2px' },
  groupTitle: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, marginBottom: '2px' },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  owners: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', maxHeight: '180px', overflowY: 'auto' },
})

interface Props {
  open: boolean
  settings: AlertSettings
  /** 担当の候補(配信カードに入っている、企画・制作の担当) */
  owners: string[]
  onClose: () => void
}

/** アラートの条件の設定(バックログ A6)。ブラウザごとに覚える */
export function AlertSettingsDialog({ open, settings, owners, onClose }: Props) {
  const styles = useStyles()
  const t = useT()
  const [draft, setDraft] = useState<AlertSettings>(settings)
  const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v))

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t('アラートの条件', 'Alert conditions')}</DialogTitle>
          <DialogContent className={styles.body}>
            <span className={styles.note}>
              {t(
                'このブラウザで覚えます(人ごとに、知らせてほしいものを決める)。ヘッダーの件数にも効きます。在庫の見込みは、すべての配信で計算し、条件は、出す配信を絞るだけです',
                'Saved in this browser (each person decides what to be told about). Also applies to the header count. Stock is still projected from all deliveries; these only narrow what is shown.',
              )}
            </span>

            <Field label={t('在庫が、配信日に何週分を切ったら「在庫僅少」にするか', 'Low stock when, on the delivery day, fewer weeks than')} size="small">
              <Select value={String(draft.lowWeeks)} onChange={(_, d) => setDraft({ ...draft, lowWeeks: Number(d.value) })}>
                {[...new Set([1, 1.5, 2, 3, 4, 6, 8, draft.lowWeeks])].sort((x, y) => x - y).map((v) => (
                  <option key={v} value={String(v)}>{t(`${v} 週分`, `${v} weeks`)}</option>
                ))}
              </Select>
            </Field>

            {/* 週の上限(C3)。決まり(⚙ の「方針・決まり」)に「上限 週 N 回」があれば、そちらが優先 */}
            <Field
              label={t('週の上限(同じ商品を、同じ週に何本の配信まで載せてよいか)', 'Weekly limit (how many deliveries the same product may appear in per week)')}
              hint={t('マーケティングの決まり(⚙ の「方針・決まり」)に「上限 週 N 回」があり、配信の国・チャネル・配信日に当てはまれば、そちらを使います', 'If a marketing rule (⚙ Policies & rules) says "上限 週 N 回" and matches the delivery’s country, channel and date, that rule is used instead')}
              size="small"
            >
              <Select value={String(draft.weeklyLimit)} onChange={(_, d) => setDraft({ ...draft, weeklyLimit: Number(d.value) })}>
                {[1, 2, 3, 4, 5, 6].map((v) => (
                  <option key={v} value={String(v)}>{t(`${v} 本まで`, `Up to ${v}`)}</option>
                ))}
              </Select>
            </Field>

            <div className={styles.group}>
              <span className={styles.groupTitle}>{t('出す種類', 'Kinds to show')}</span>
              {(
                [
                  ['outOfStock', t('在庫切れの見込み', 'Out of stock (expected)')],
                  ['lowStock', t('在庫僅少', 'Low stock')],
                  ['policyChanged', t('MD 方針の変更', 'MD policy change')],
                  ['dateChanged', t('日程の変更', 'Date change')],
                ] as const
              ).map(([k, label]) => (
                <Checkbox key={k} label={label} checked={draft.kinds[k]} onChange={(_, d) => setDraft({ ...draft, kinds: { ...draft.kinds, [k]: !!d.checked } })} />
              ))}
            </div>

            <div className={styles.group}>
              <span className={styles.groupTitle}>{t('対象にする種類(選ばなければ、すべて)', 'Theme types (none = all)')}</span>
              {THEME_TYPES.map((v) => (
                <Checkbox key={v} label={themeTypeLabel(v)} checked={draft.departments.includes(v)} onChange={(_, d) => setDraft({ ...draft, departments: toggle(draft.departments, v, !!d.checked) })} />
              ))}
            </div>

            <div className={styles.group}>
              <span className={styles.groupTitle}>{t('対象にする担当(選ばなければ、すべて。企画・制作のどちらか)', 'Owners (none = all; planning or production)')}</span>
              <div className={styles.owners}>
                {owners.map((o) => (
                  <Checkbox key={o} label={o} checked={draft.owners.includes(o)} onChange={(_, d) => setDraft({ ...draft, owners: toggle(draft.owners, o, !!d.checked) })} />
                ))}
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="subtle" onClick={() => setDraft(DEFAULT_ALERT_SETTINGS)}>
              {t('最初の設定に戻す', 'Reset to defaults')}
            </Button>
            <Button appearance="secondary" onClick={onClose}>{t('やめる', 'Cancel')}</Button>
            <Button
              appearance="primary"
              onClick={() => {
                setAlertSettings(draft)
                onClose()
              }}
            >
              {t('保存', 'Save')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
