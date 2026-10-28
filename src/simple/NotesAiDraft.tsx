import { useState } from 'react'
import { Button, Input, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { AiIcon } from '../AiMark'
import { MarkdownLite } from '../MarkdownLite'
import { useT } from '../i18n'
import type { PartIdea } from './partAi'

// 渡す文章(制作指示)の AI(2026-10-29 利用者): 「AI で書く」を押す → 欄の真下に案が並ぶ → 押した案がそのまま入る、の 2 つの操作だけにする。
// ほかの部品の「試す → 確定」(引き出し・帯)にしないのは、渡す文章がプレビューに出ない長い文で、AI に書かせてから人が直すものだから
// (プレビューで見比べるものがなく、入れたあとに欄で直す。入れたあとも「元に戻す」で戻せるので、確定の一手間を省く)。
// 案にマウスを乗せている間は、欄に仮に見せる(onPreview)
const useStyles = makeStyles({
  bar: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  request: { flexGrow: 1, minWidth: '160px' },
  list: { display: 'grid', rowGap: '6px' },
  idea: {
    display: 'grid',
    rowGap: '4px',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    ':hover': { borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1, backgroundColor: tokens.colorBrandBackground2 },
  },
  why: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

interface Props {
  /** いまの渡す文章(空なら「AI で書く」、あれば「AI で書き直す」) */
  value: string
  /** 案を作る(request = 頼み。空ならいつもの頼み) */
  ask: (request: string) => Promise<PartIdea[]>
  /** 案にマウスを乗せている間、欄に仮に見せる(null で戻す) */
  onPreview: (value: string | null) => void
  /** 押した案を入れる */
  onAdopt: (idea: PartIdea) => void
  disabled?: boolean
}

export function NotesAiDraft({ value, ask, onPreview, onAdopt, disabled }: Props) {
  const t = useT()
  const s = useStyles()
  const [request, setRequest] = useState('')
  const [ideas, setIdeas] = useState<PartIdea[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setIdeas(null)
    try {
      const list = await ask(request.trim())
      setIdeas(list)
      if (list.length === 0) setError(t('案を出せませんでした。もう一度押してください', 'No drafts came back. Please try again'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const adopt = (idea: PartIdea) => {
    onPreview(null)
    onAdopt(idea)
    setIdeas(null)
    setRequest('')
  }
  const close = () => {
    onPreview(null)
    setIdeas(null)
  }

  return (
    <>
      <div className={s.bar}>
        <Button size="small" appearance="primary" icon={busy ? <Spinner size="extra-tiny" /> : <AiIcon size={14} tone="white" />} disabled={busy || disabled} onClick={() => void run()}>
          {value.trim() ? t('AI で書き直す', 'Rewrite with AI') : t('AI で書く', 'Write with AI')}
        </Button>
        {/* 頼みは任意(空でも押せる) */}
        <Input
          className={s.request}
          size="small"
          value={request}
          disabled={busy || disabled}
          placeholder={t('頼み(任意。例: 画像の指示を足して)', 'Request (optional, e.g. add image directions)')}
          aria-label={t('AI への頼み(任意)', 'Request for AI (optional)')}
          onChange={(_, d) => setRequest(d.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && !ev.nativeEvent.isComposing) {
              ev.preventDefault()
              void run()
            }
          }}
        />
      </div>
      {busy && <span className={s.note}>{t('AI が書いています…', 'AI is writing…')}</span>}
      {ideas && ideas.length > 0 && (
        <div className={s.list} onMouseLeave={() => onPreview(null)}>
          <span className={s.note}>{t('押すと、その案が入ります(あとで直せます。元に戻すでも戻せます)', 'Click a draft to use it (you can edit it afterwards, or undo)')}</span>
          {ideas.map((idea) => (
            <button key={`${idea.value}\n${idea.why}`} type="button" className={s.idea} disabled={disabled} onMouseEnter={() => onPreview(idea.value)} onFocus={() => onPreview(idea.value)} onClick={() => adopt(idea)}>
              <MarkdownLite text={idea.value} />
              {idea.why && <span className={s.why}>{idea.why}</span>}
            </button>
          ))}
          <div>
            <Button size="small" appearance="subtle" onClick={close}>
              {t('使わない', 'Dismiss')}
            </Button>
          </div>
        </div>
      )}
      {error && <span className={s.error}>{error}</span>}
    </>
  )
}
