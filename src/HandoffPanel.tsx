import { Badge, Button, Field, Input, makeStyles, tokens } from '@fluentui/react-components'
import { CheckmarkCircleRegular, SendRegular } from '@fluentui/react-icons'
import { locale, useT } from './i18n'
import { PersonInput } from './PersonInput'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0 },
  head: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '12px', alignItems: 'end' },
  done: { display: 'flex', alignItems: 'center', columnGap: '8px', flexWrap: 'wrap', fontSize: tokens.fontSizeBase200 },
  warn: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
  actions: { display: 'flex', columnGap: '8px', flexWrap: 'wrap' },
})

interface Props {
  /** 制作の担当者 */
  productionOwner: string
  onProductionOwner: (v: string) => void
  /** 引き継いだ日時(ISO。空は、まだ引き継いでいない) */
  handedOffAt: string
  onHandedOffAt: (v: string) => void
  /** 制作の締め切り(YYYY-MM-DD) */
  productionDue: string
  onProductionDue: (v: string) => void
  /** 終わっていない工程(引き継ぐ前の注意に出す) */
  remaining: string[]
  /** これまでに入れた名前(入力の候補) */
  people: string[]
}

/**
 * 制作への引き継ぎ。制作の担当者・締め切りは、ここだけで決める(左の配信情報は表示だけ。FLOWS の C-3)。
 * 「制作に引き継ぐ」で、引き継いだ日時を残す(保存で確定する)。
 * 制作担当への実際の通知(メールなど)は、まだ行わない(バックログ P3 の後)。
 */
export function HandoffPanel({ productionOwner, onProductionOwner, handedOffAt, onHandedOffAt, productionDue, onProductionDue, remaining, people }: Props) {
  const styles = useStyles()
  const t = useT()

  return (
    <div className={styles.root}>
      <div>
        <div className={styles.head}>{t('制作への引き継ぎ', 'Handoff to production')}</div>
        <div className={styles.caption}>
          {t('制作の担当者と締め切りを決めて「制作に引き継ぐ」を押し、保存します。左の配信情報には、ここで決めた内容が出ます。', 'Choose the production assignee and due date, press “Hand off to production”, then save. Delivery info on the left shows what you set here.')}
        </div>
      </div>
      <div className={styles.row}>
        <Field label={t('制作の担当者', 'Production assignee')} size="small">
          <PersonInput value={productionOwner} onChange={onProductionOwner} people={people} />
        </Field>
        <Field label={t('制作の締め切り', 'Production due')} size="small">
          <Input size="small" type="date" value={productionDue} onChange={(_, d) => onProductionDue(d.value)} />
        </Field>
      </div>
      {handedOffAt ? (
        <div className={styles.done}>
          <Badge appearance="tint" color="success" icon={<CheckmarkCircleRegular />}>
            {t('引き継ぎ済み', 'Handed off')}
          </Badge>
          {new Date(handedOffAt).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {productionOwner && ` · ${productionOwner}`}
          <Button size="small" appearance="subtle" onClick={() => onHandedOffAt('')}>
            {t('取り消す', 'Undo')}
          </Button>
        </div>
      ) : (
        <>
          {remaining.length > 0 && (
            <div className={styles.warn}>{t(`まだ終わっていない工程があります: ${remaining.join('、')}`, `Some steps are not done yet: ${remaining.join(', ')}`)}</div>
          )}
          {!productionOwner.trim() && <div className={styles.warn}>{t('制作の担当者を入れてください', 'Enter the production assignee')}</div>}
          <div className={styles.actions}>
            <Button size="small" appearance="primary" icon={<SendRegular />} disabled={!productionOwner.trim()} onClick={() => onHandedOffAt(new Date().toISOString())}>
              {t('制作に引き継ぐ', 'Hand off to production')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
