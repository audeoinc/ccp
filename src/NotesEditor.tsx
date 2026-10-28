import { useEffect, type MutableRefObject } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import { Tooltip, ToolbarButton, Toolbar, makeStyles, tokens } from '@fluentui/react-components'
import { TextBoldRegular, TextBulletListLtrRegular, TextHeader3Regular, TextNumberListLtrRegular, ArrowUndoRegular, ArrowRedoRegular } from '@fluentui/react-icons'
import { useT } from './i18n'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderBottomColor: tokens.colorNeutralStrokeAccessible,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    ':focus-within': { borderBottomColor: tokens.colorCompoundBrandStroke, boxShadow: `inset 0 -1px 0 ${tokens.colorCompoundBrandStroke}` },
  },
  toolbar: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, padding: '2px 4px', columnGap: '2px' },
  on: { backgroundColor: tokens.colorNeutralBackground1Selected },
  content: {
    flexGrow: 1,
    padding: '8px 12px',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    color: tokens.colorNeutralForeground1,
    cursor: 'text',
    '& .ProseMirror': { outline: 'none', minHeight: 'var(--notes-min-height, 320px)' },
    '& .ProseMirror > *:first-child': { marginTop: 0 },
    '& h3': { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, margin: '12px 0 4px' },
    '& h1, & h2': { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, margin: '12px 0 4px' },
    '& p': { margin: '0 0 6px' },
    '& ul, & ol': { margin: '0 0 6px', paddingLeft: '22px' },
    '& li > p': { margin: 0 },
    // 入力が空のときの案内(Placeholder 拡張が、最初の段落に data-placeholder を付ける)
    '& p.is-editor-empty:first-child::before': {
      content: 'attr(data-placeholder)',
      float: 'left',
      height: 0,
      pointerEvents: 'none',
      color: tokens.colorNeutralForeground4,
    },
  },
})

interface Props {
  /** Markdown の文字列(保存される形) */
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  /** 入力欄の最小の高さ(CSS の値) */
  minHeight?: string
  /** 読むだけ(AI の案を仮に写しているあいだなど) */
  readOnly?: boolean
  /** カーソルの位置に文字を差し込む関数を受け取る(「素材を挿入」のように、欄の外のメニューから差し込むため) */
  insertRef?: MutableRefObject<((text: string) => void) | null>
}

/**
 * 制作指示の入力欄。見たまま編集(TipTap)で、保存は Markdown の文字列。
 * 「- 」で箇条書き、「1. 」で番号つき、「### 」で見出し、「**文字**」で太字に、その場で変わる(TipTap の入力ルール)。
 * 保存が文字のままなので、AI への受け渡しや、CSV の書き出し、以前に保存した内容は、そのまま使える。
 */
export function NotesEditor({ value, onChange, placeholder, minHeight, readOnly, insertRef }: Props) {
  const styles = useStyles()
  const t = useT()
  const editor = useEditor({
    extensions: [
      // 見出しは 3 段目だけ(制作指示の区切りに使う。大きな見出しは要らない)
      StarterKit.configure({ heading: { levels: [3] }, code: false, codeBlock: false, blockquote: false, horizontalRule: false, link: false }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      Markdown,
    ],
    content: value,
    contentType: 'markdown',
    onUpdate: ({ editor: e }) => onChange(e.getMarkdown()),
  })

  // 外から値が変わったとき(案の採用、AI の下書き)だけ、中身を入れ替える(入力中の自分の変更では、入れ替えない)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (editor.getMarkdown() === value) return
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
  }, [editor, value])

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!readOnly, false)
  }, [editor, readOnly])
  // 差し込みは、最後にカーソルがあった所へ(メニューを押すと欄から焦点が外れるが、TipTap は選択範囲を覚えている)
  useEffect(() => {
    if (!insertRef) return
    insertRef.current = (text) => editor?.chain().focus().insertContent(text).run()
    return () => {
      insertRef.current = null
    }
  }, [editor, insertRef])
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: !!e?.isActive('bold'),
      bullet: !!e?.isActive('bulletList'),
      ordered: !!e?.isActive('orderedList'),
      heading: !!e?.isActive('heading', { level: 3 }),
      undo: !!e?.can().undo(),
      redo: !!e?.can().redo(),
    }),
  })

  const btn = (label: string, icon: React.ReactElement, active: boolean | undefined, run: () => void, disabled = false) => (
    <Tooltip content={label} relationship="label">
      <ToolbarButton
        appearance="subtle"
        icon={icon}
        aria-pressed={active}
        className={active ? styles.on : undefined}
        disabled={disabled}
        // ボタンを押しても、入力欄のカーソル(選択範囲)を失わないように
        onMouseDown={(e) => e.preventDefault()}
        onClick={run}
      />
    </Tooltip>
  )

  return (
    <div className={styles.root} style={minHeight ? ({ '--notes-min-height': minHeight } as React.CSSProperties) : undefined}>
      <Toolbar size="small" className={styles.toolbar} aria-label={t('書式', 'Formatting')}>
        {btn(t('見出し(### )', 'Heading (### )'), <TextHeader3Regular />, state?.heading, () => editor?.chain().focus().toggleHeading({ level: 3 }).run())}
        {btn(t('太字(**文字**)', 'Bold (**text**)'), <TextBoldRegular />, state?.bold, () => editor?.chain().focus().toggleBold().run())}
        {btn(t('箇条書き(- )', 'Bulleted list (- )'), <TextBulletListLtrRegular />, state?.bullet, () => editor?.chain().focus().toggleBulletList().run())}
        {btn(t('番号つき(1. )', 'Numbered list (1. )'), <TextNumberListLtrRegular />, state?.ordered, () => editor?.chain().focus().toggleOrderedList().run())}
        {btn(t('元に戻す', 'Undo'), <ArrowUndoRegular />, false, () => editor?.chain().focus().undo().run(), !state?.undo)}
        {btn(t('やり直す', 'Redo'), <ArrowRedoRegular />, false, () => editor?.chain().focus().redo().run(), !state?.redo)}
      </Toolbar>
      <EditorContent editor={editor} className={styles.content} onClick={() => editor?.commands.focus()} />
    </div>
  )
}
