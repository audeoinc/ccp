// 工程の段を進めるボタン(X86 の ①。prod.steps)。題の行の「自分の番」の青いボタンと、左のバーの「工程」の両方で使う。段の決め方は useProductionFlow.ts
import { useState, type ReactNode } from 'react'
import { Button, Input, Popover, PopoverSurface, PopoverTrigger, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { CheckmarkRegular, HandRightRegular, SendRegular } from '@fluentui/react-icons'
import { AutoTextarea } from '../AutoTextarea'
import { useT, when } from '../i18n'
import { useFeature } from '../featureFlags'
import type { VariantKey } from '../abTest'
import type { ProductionFlow, StepInfo } from './useProductionFlow'

const useStyles = makeStyles({
  box: { display: 'grid', rowGap: '8px', width: '320px' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', columnGap: '6px', flexWrap: 'wrap', alignItems: 'center' },
  variant: { display: 'flex', columnGap: '8px', alignItems: 'baseline', fontSize: tokens.fontSizeBase200 },
  pending: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
})

/** AB テストの案ごとの、制作した HTML の保存の様子(③ の窓に出す。P4) */
export interface VariantSave {
  key: VariantKey
  by?: string | null
  at?: string | null
  /** 打っている・保存している途中 */
  pending?: boolean
}

/**
 * その段を進めるボタン(題の行の青いボタンと、左のバーの工程の両方で使う)。
 * ② 受け取る・③ 制作が終わった(ひとこと・リンク)・④ これで OK / 直してほしい(理由)・⑤ 送る。① は配信カードで渡す
 */
export function StepAction({ flow, step, onViewResult, needMe, variants }: { flow: ProductionFlow; step: StepInfo; onViewResult?: () => void; needMe?: string | null; variants?: VariantSave[] }): ReactNode {
  const s = useStyles()
  const t = useT()
  // ⑤ 送るは、外部の配信システムへの連携(prod.export)。非公開なら、工程は ④ の OK で終わり(MVP の終点。2026-10-30 利用者)
  const exportOn = useFeature('prod.export')
  const abOn = useFeature('card.abtest')
  const [doneNote, setDoneNote] = useState('')
  const [doneLink, setDoneLink] = useState('')
  const [reviseNote, setReviseNote] = useState('')
  const off = flow.busy || !!needMe
  switch (step.key) {
    case 'request':
      return <span className={s.note}>{t('配信カードの「渡すもの」の「制作に渡す」で渡します', 'Hand off with "Hand off to production" in the delivery card’s handoff')}</span>
    case 'receive':
      return (
        <Button size="small" appearance="primary" icon={<HandRightRegular />} disabled={off} title={needMe ?? undefined} onClick={() => void flow.act.receive()}>
          {t('受け取る', 'Receive')}
        </Button>
      )
    case 'make':
      return (
        <Popover withArrow positioning="below-end" trapFocus>
          <PopoverTrigger disableButtonEnhancement>
            <Button size="small" appearance="primary" icon={<CheckmarkRegular />} disabled={off} title={needMe ?? undefined}>
              {t('制作が終わった', 'Production done')}
            </Button>
          </PopoverTrigger>
          <PopoverSurface>
            <div className={s.box}>
              {/* AB テストは、全案の HTML がそろってから終わりにする(詳しい制作のページと同じ。P4) [card.abtest] */}
              {abOn && variants && variants.length > 1 && (
                <>
                  <span className={s.note}>{t('AB テストの全案の HTML がそろってから、終わりにします', 'Mark as done once every variant’s HTML is ready')}</span>
                  {variants.map((v) => (
                    <span key={v.key} className={s.variant}>
                      <b>{t(`${v.key} 案`, `Variant ${v.key}`)}</b>
                      {v.pending ? (
                        <span className={s.pending}>{t('保存しています…', 'Saving…')}</span>
                      ) : v.by ? (
                        <span className={s.note}>{t(`保存: ${v.by} ${when(v.at ?? undefined)}`, `Saved by ${v.by} ${when(v.at ?? undefined)}`)}</span>
                      ) : (
                        <span className={s.note}>{t('まだ(渡したときの HTML のまま)', 'Not yet (still the HTML from the handoff)')}</span>
                      )}
                    </span>
                  ))}
                </>
              )}
              <span className={s.note}>{t('ひとこと・できたもののリンクを添えられます(どちらも任意)', 'You can add a note and a link to the result (both optional)')}</span>
              <AutoTextarea heightKey="ProductionSimple.doneNote" rows={1} size="small" value={doneNote} onChange={(_, d) => setDoneNote(d.value)} placeholder={t('ひとこと', 'Note')} />
              <Input size="small" value={doneLink} onChange={(_, d) => setDoneLink(d.value)} placeholder="https://" />
              <Button size="small" appearance="primary" icon={<CheckmarkRegular />} disabled={flow.busy} onClick={() => void flow.act.done(doneNote, doneLink)}>
                {t('制作が終わった', 'Production done')}
              </Button>
            </div>
          </PopoverSurface>
        </Popover>
      )
    case 'check':
      return (
        <span className={s.row}>
          {onViewResult && (
            <Button size="small" onClick={onViewResult}>
              {t('仕上がりを見る', 'View result')}
            </Button>
          )}
          <Tooltip content={needMe ?? t('プレビューと HTML を見て、これで送ってよければ押します', 'Press when the preview and HTML are good to send')} relationship="description">
            <Button size="small" appearance="primary" icon={<CheckmarkRegular />} disabled={off} onClick={() => void flow.act.check()}>
              {t('これで OK', 'Looks good')}
            </Button>
          </Tooltip>
          <Popover withArrow positioning="below-end" trapFocus>
            <PopoverTrigger disableButtonEnhancement>
              <Button size="small" disabled={off}>
                {t('直してほしい', 'Request a fix')}
              </Button>
            </PopoverTrigger>
            <PopoverSurface>
              <div className={s.box}>
                <span className={s.note}>{t('直してほしいことを書いて、制作に戻します(③ 制作する に戻ります)', 'Write what to fix and send it back to production (back to step 3)')}</span>
                <AutoTextarea heightKey="ProductionSimple.reviseNote" rows={2} size="small" value={reviseNote} onChange={(_, d) => setReviseNote(d.value)} placeholder={t('例: ボタンの文言を「今すぐ見る」に', 'e.g. Change the button text to "Shop now"')} />
                <Button size="small" appearance="primary" disabled={flow.busy || !reviseNote.trim()} onClick={() => void flow.act.revise(reviseNote).then((ok) => ok && setReviseNote(''))}>
                  {t('制作に戻す', 'Send back')}
                </Button>
              </div>
            </PopoverSurface>
          </Popover>
        </span>
      )
    case 'send':
      if (!exportOn) return null
      return (
        <Tooltip content={needMe ?? t('HTML と、テキスト・リンク先を、配信のしくみに送ります(いまは送り先が仮です)', 'Sends the HTML, text and links to the delivery system (the destination is a placeholder for now)')} relationship="description">
          <Button size="small" appearance="primary" icon={<SendRegular />} disabled={off} onClick={() => void flow.act.send()}>
            {t('送る', 'Send')}
          </Button>
        </Tooltip>
      )
  }
}
