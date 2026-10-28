// テンプレートを AI で直すの、頼むフロート(設計は docs/TEMPLATE_OBJECTS.md の 11 章)。
// 返答は、ここではキャンバスに当てない。呼ぶ側が受け取り、キャンバスに仮に当てて「確定」「やめる」を出す(試す → 確定)
import { useState } from 'react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogTitle, Field, InfoLabel, MessageBar, MessageBarBody, Spinner, makeStyles } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { AiIcon } from './AiMark'
import { ResizableSurface } from './ResizableSurface'
import { AutoTextarea } from './AutoTextarea'
import { askTemplateEdit } from './templateAi'
import { isNoChange, type EditableLayout, type TemplateEditOut } from './templateEdit'
import { useT } from './i18n'

const useStyles = makeStyles({
  surface: { width: '520px', maxWidth: 'calc(94vw / var(--ui-zoom, 1))' },
  titleRow: { display: 'flex', alignItems: 'center', columnGap: '6px' },
  grow: { flexGrow: 1 },
  body: { display: 'grid', rowGap: '10px' },
  examples: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
})

interface Props {
  /** 直す前の形(今の編集中) */
  current: EditableLayout
  /** 頼み直すときの、前に頼んだ文 */
  initial?: string
  onResult: (out: TemplateEditOut, request: string) => void
  onClose: () => void
}

export function TemplateAiEditDialog({ current, initial = '', onResult, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 例(押すと欄に入る。頼み方の目安になるように、よくある直しを並べる)
  const examples = [
    t('2 列のグリッドを 3 列に', 'Make the 2-column grid 3 columns'),
    t('全部の箱にセールのバッジ', 'Add a sale badge to every box'),
    t('最後に SNS のアイコンの行を足して', 'Add a row of social icons at the end'),
    t('主役のセクションを一番上に', 'Move the featured section to the top'),
  ]
  const ask = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const out = await askTemplateEdit(text, current)
      if (isNoChange(out.diff)) {
        // 形が変わらなければ、試すものがない。AI が書いた理由があれば、それを出す
        setError(out.summary || t('AI は、形を変えませんでした。頼み方を変えてみてください', 'The AI did not change the layout. Try asking differently.'))
        return
      }
      onResult(out, text.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && !busy && onClose()}>
      <ResizableSurface sizeKey="templateAiEdit" min={{ w: 420, h: 300 }} className={s.surface}>
        <DialogBody>
          <DialogTitle
            action={<Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} disabled={busy} />}
          >
            <span className={s.titleRow}>
              <AiIcon />
              {t('AI で直す', 'Edit with AI')}
              <InfoLabel
                size="large"
                info={t(
                  '今のテンプレートへの直しを、言葉で頼めます。AI の直した形は、まずキャンバスに仮に当てます(変わった所に点線)。「確定」で取り込み、「やめる」で元に戻します。確定しても Ctrl+Z で戻せます。保存は、いつもの「保存」です。',
                  'Describe a change to this template. The AI result is first applied to the canvas as a trial (changed cells are dashed). Confirm to keep it or cancel to go back; you can still undo with Ctrl+Z. Save as usual.',
                )}
              />
            </span>
          </DialogTitle>
          <DialogContent className={s.body}>
            <Field label={t('直してほしいこと', 'What to change')}>
              <AutoTextarea
                heightKey="templateAiEdit"
                value={text}
                rows={3}
                placeholder={t('例: 2 列のグリッドを 3 列に', 'e.g. Make the 2-column grid 3 columns')}
                onChange={(_, d) => setText(d.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    void ask()
                  }
                }}
              />
            </Field>
            <div className={s.examples}>
              {examples.map((x) => (
                <Button key={x} size="small" appearance="outline" shape="circular" onClick={() => setText(x)} disabled={busy}>
                  {x}
                </Button>
              ))}
            </div>
            {error && (
              <MessageBar intent="warning" layout="multiline">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={busy}>
              {t('閉じる', 'Close')}
            </Button>
            {/* 塗りのボタンでは白い印。押せないとき(塗りが薄くなる)は、白では見えないので文字の色に */}
            <Button appearance="primary" icon={busy ? <Spinner size="tiny" /> : <AiIcon tone={text.trim() ? 'white' : 'accent'} />} onClick={() => void ask()} disabled={!text.trim() || busy}>
              {busy ? t('AI が直しています…', 'AI is working…') : t('頼む', 'Ask')}
            </Button>
          </DialogActions>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
