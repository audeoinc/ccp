// 「AI でテンプレートを作る」のフロート(T9。設計は docs/TEMPLATE_OBJECTS.md の 9 章)。
// 入力 → (近いテンプレートを知らせる)→ AI の下書き → (近いテンプレートを知らせる)→ この下書きで編集を始める / 近いものを使う・複製して直す。
// AI の案は保存しない(決まり)。保存は、テンプレートの編集の「保存」で人が確かめてから
import { useState } from 'react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogTitle, Field, InfoLabel, Input, MessageBar, MessageBarBody, Radio, RadioGroup, SpinButton, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { SparkleRegular } from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import { ResizableSurface } from './ResizableSurface'
import { TemplateThumb } from './TemplateThumb'
import { LabeledValue } from './LabeledValue'
import { useT } from './i18n'
import { typo } from './typo'
import { askTemplateDraft } from './templateAi'
import { layoutOfDraft, nearTemplates, type NearTemplate, type TemplateAiInput, type TemplateDraftOut } from './templateDraft'
import type { HeroKind, TemplateLayout } from './templates'
import { boxCount } from './templateShape'

const useStyles = makeStyles({
  surface: { width: '760px', maxWidth: 'calc(94vw / var(--ui-zoom, 1))' },
  // ボタンの文言を折り返さない(4 つ並ぶと、縦に長くなって読みにくいため)
  actions: { '& button': { whiteSpace: 'nowrap', flexShrink: 0 } },
  content: { display: 'grid', rowGap: '12px' },
  two: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '12px', alignItems: 'start' },
  // 題と ⓘ(使い方の説明は、題の横の InfoLabel に。見出しの下に説明の文を並べない決まり)
  titleRow: { display: 'inline-flex', alignItems: 'center', columnGap: '6px' },
  // 近いテンプレートの欄の見出し(組ではない、欄の見出しの形のラベル)
  nearTitle: typo.label,
  near: { display: 'grid', rowGap: '8px', padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  nearRow: { display: 'flex', alignItems: 'center', columnGap: '12px', flexWrap: 'wrap' },
  // テンプレートの名前は、行のいちばん大事な値なので太く
  nearName: { ...typo.valueStrong, flexGrow: 1, minWidth: 0 },
  result: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: '16px', alignItems: 'start' },
  info: { display: 'grid', rowGap: '10px', minWidth: 0 },
})

interface Props {
  /** 比べる相手(選べるメールのテンプレート) */
  options: ({ id: string; label: string } & TemplateLayout)[]
  /** そのテンプレートを開く */
  onUse: (id: string) => void
  /** そのテンプレートを複製して、編集を始める */
  onDuplicate: (id: string) => void
  /** AI の下書きで、テンプレートの編集(新規)を始める */
  onDraft: (d: TemplateDraftOut) => void
  onClose: () => void
}

export function TemplateAiDialog({ options, onUse, onDuplicate, onDraft, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  const [input, setInput] = useState<TemplateAiInput>({ purpose: '', itemCount: 4, angle: '', hero: 'standard' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<TemplateDraftOut | null>(null)
  const set = (p: Partial<TemplateAiInput>) => setInput((x) => ({ ...x, ...p }))
  const make = async () => {
    setBusy(true)
    setError(null)
    try {
      setDraft(await askTemplateDraft(input))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const before = nearTemplates(options, input)
  const after = draft ? nearTemplates(options, input, layoutOfDraft(draft)) : []
  const nearBox = (list: NearTemplate[], title: string) =>
    list.length > 0 && (
      <div className={s.near}>
        <span className={s.nearTitle}>{title}</span>
        {list.map((n) => (
          <div key={n.id} className={s.nearRow}>
            <span className={s.nearName}>{n.label}</span>
            {/* 作ったあとは、どれだけ近いか(作る前は、数と雰囲気が同じものだけなので出さない) */}
            {draft && <LabeledValue label={t('似ている度', 'Similarity')}>{n.same ? t('同じ構成', 'Same layout') : `${Math.round(n.score * 100)}%`}</LabeledValue>}
            <Button size="small" onClick={() => onUse(n.id)}>{t('使う', 'Use')}</Button>
            <Button size="small" appearance="subtle" onClick={() => onDuplicate(n.id)}>{t('複製して直す', 'Duplicate and edit')}</Button>
          </div>
        ))}
      </div>
    )
  const heroOpts: [HeroKind, string][] = [
    ['standard', t('標準', 'Standard')],
    ['offer', t('セール・期間限定', 'Sale / limited time')],
    ['collab', t('コラボ', 'Collaboration')],
  ]
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="templateAi" min={{ w: 560, h: 420 }} className={s.surface}>
        <DialogBody>
          <DialogTitle>
            <span className={s.titleRow}>
              {t('AI でテンプレートを作る', 'Create a template with AI')}
              <InfoLabel
                size="large"
                info={t('目的と商品の数を伝えると、AI がセクションと部品(箱・ボタン・テキスト・画像・区切り線)の並びを組み立てて、下書きにします。下書きは保存されません。編集の画面で確かめてから、いつもの「保存」で保存します。', 'Tell the AI the purpose and number of products; it arranges sections and parts (boxes, buttons, text, images, dividers) into a draft. The draft is not saved; check it in the editor, then save as usual.')}
              />
            </span>
          </DialogTitle>
          <DialogContent className={s.content}>
            {!draft ? (
              <>
                <Field label={t('目的(何のための配信か)', 'Purpose (what the email is for)')} size="small" required>
                  <Input size="small" value={input.purpose} placeholder={t('例: 週末の新作の紹介', 'e.g. Weekend new arrivals')} maxLength={120} onChange={(_, d) => set({ purpose: d.value })} />
                </Field>
                <div className={s.two}>
                  <Field label={t('載せる商品の数', 'Number of products')} size="small">
                    <SpinButton size="small" value={input.itemCount} min={1} max={24} onChange={(_, d) => set({ itemCount: Math.max(1, Math.min(24, Math.round(Number(d.value ?? d.displayValue) || input.itemCount))) })} />
                  </Field>
                  <Field label={t('雰囲気(メイン画像)', 'Tone (main image)')} size="small">
                    <RadioGroup layout="horizontal" value={input.hero} onChange={(_, d) => set({ hero: d.value as HeroKind })}>
                      {heroOpts.map(([v, l]) => (
                        <Radio key={v} value={v} label={l} />
                      ))}
                    </RadioGroup>
                  </Field>
                </div>
                <Field label={t('切り口・構成のメモ(任意)', 'Angle / layout notes (optional)')} size="small">
                  <AutoTextarea heightKey="TemplateAiDialog.angle" size="small" rows={2} value={input.angle} placeholder={t('例: 主役を 1 点大きく、残りはグリッド。最後に「もっと見る」', 'e.g. One hero product large, the rest in a grid, then “See more”')} maxLength={400} onChange={(_, d) => set({ angle: d.value })} />
                </Field>
                {nearBox(before, t('同じ商品の数・雰囲気のテンプレートがあります。使い回すこともできます', 'Templates with the same number of products and tone exist. You can reuse one.'))}
              </>
            ) : (
              <>
                <div className={s.result}>
                  <TemplateThumb layout={layoutOfDraft(draft)} width={150} maxHeight={320} />
                  <div className={s.info}>
                    {/* ラベルと値の組は LabeledValue(ラベルは目印として小さく薄く、値を主役に。2026-10-27 の決まり) */}
                    <LabeledValue layout="stacked" label={t('名前', 'Name')} strong>{draft.name}</LabeledValue>
                    <LabeledValue layout="stacked" label={t('説明', 'Description')} emptyText="—">{draft.description}</LabeledValue>
                    <LabeledValue label={t('商品の枠', 'Product slots')}>{t(`${boxCount(layoutOfDraft(draft))} 点`, `${boxCount(layoutOfDraft(draft))}`)}</LabeledValue>
                    <LabeledValue label={t('セクション', 'Sections')}>{draft.sections.length}</LabeledValue>
                    <LabeledValue layout="stacked" label={t('この構成にした理由', 'Why this layout')} emptyText="—">{draft.reason}</LabeledValue>
                    <MessageBar intent="info" layout="multiline">
                      <MessageBarBody>{t('AI の下書きは、まだ保存されていません。編集の画面で直して、保存してください。', 'The AI draft is not saved yet. Edit it, then save.')}</MessageBarBody>
                    </MessageBar>
                  </div>
                </div>
                {nearBox(after, t('構成が近いテンプレートがあります。使い回すか、複製して直すこともできます', 'Similar templates exist. You can reuse one or duplicate and edit it.'))}
              </>
            )}
            {busy && <Spinner size="tiny" label={t('AI が構成を組み立てています…', 'The AI is arranging the layout…')} />}
            {error && (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions className={s.actions}>
            <Button onClick={onClose}>{t('やめる', 'Cancel')}</Button>
            {draft && (
              <Button onClick={() => setDraft(null)} disabled={busy}>
                {t('入力に戻る', 'Back to inputs')}
              </Button>
            )}
            {draft && (
              <Button icon={<SparkleRegular />} onClick={() => void make()} disabled={busy}>
                {t('作り直す', 'Regenerate')}
              </Button>
            )}
            {draft ? (
              <Button appearance="primary" onClick={() => onDraft(draft)} disabled={busy}>
                {t('この下書きで編集を始める', 'Start editing this draft')}
              </Button>
            ) : (
              <Button appearance="primary" icon={<SparkleRegular />} onClick={() => void make()} disabled={busy || !input.purpose.trim()}>
                {t('AI で作る', 'Create with AI')}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
