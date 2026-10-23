import { useEffect, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Switch,
  Textarea,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { AddRegular, ArrowDownloadRegular, ArrowUploadRegular, DeleteRegular, MoreHorizontalRegular, PinRegular, SaveRegular } from '@fluentui/react-icons'
import { FilesApi, bytesLabel, isFailure, type WorkFile } from './api'
import { CopyButton } from './CopyButton'

const useStyles = makeStyles({
  body: { display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: '12px', minHeight: '60vh' },
  list: { display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', maxHeight: '64vh', borderRight: `1px solid ${tokens.colorNeutralStroke2}`, paddingRight: '8px' },
  line: { display: 'flex', alignItems: 'center', gap: '2px', borderRadius: tokens.borderRadiusMedium, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  item: { border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', padding: '4px 6px', display: 'flex', flexDirection: 'column', color: tokens.colorNeutralForeground1, flexGrow: 1, minWidth: 0 },
  itemOn: { backgroundColor: tokens.colorBrandBackground2 },
  name: { fontSize: tokens.fontSizeBase200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' },
  meta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  edit: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 },
  row: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  grow: { flexGrow: 1, minWidth: 0 },
  text: { fontFamily: tokens.fontFamilyMonospace, flexGrow: 1, '& textarea': { minHeight: '46vh' } },
  muted: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const toBase64 = (buf: ArrayBuffer) => {
  let s = ''
  const b = new Uint8Array(buf)
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * 作業ファイル(Workbench の server/devwork/files/)。引き継ぎ・SQL・コーディングルールなどを置く。
 * 「いつも AI に渡す」を入れたファイルは、会話の前提に毎回入る(コーディングルールを守らせる・引き継ぎから続ける)。AI も道具で読み書きする
 */
export function FilesDialog({ open, onClose, initial, onChanged }: { open: boolean; onClose: () => void; initial?: string | null; onChanged?: () => void }) {
  const s = useStyles()
  const [files, setFiles] = useState<WorkFile[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const upload = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const r = await FilesApi.list()
    if (!isFailure(r)) setFiles(r.files)
  }

  const openFile = async (n: string) => {
    const r = await FilesApi.get(n)
    if (isFailure(r)) return setError(r.error)
    setCurrent(n)
    setName(n)
    setContent(r.content)
    setSaved(r.content)
    setError('')
  }

  useEffect(() => {
    if (!open) return
    void (async () => {
      const r = await FilesApi.list()
      if (!isFailure(r)) setFiles(r.files)
      if (initial) await openFile(initial)
    })()
  }, [open, initial])

  const save = async () => {
    const n = name.trim()
    if (!n) return
    if (n !== current && files.some((f) => f.name === n) && !window.confirm(`${n} は、もうあります。上書きしますか?`)) return
    const r = await FilesApi.save(n, content)
    if (isFailure(r)) return setError(r.error)
    setCurrent(n)
    setSaved(content)
    setError('')
    await refresh()
    onChanged?.()
  }

  const remove = async (n: string) => {
    if (!window.confirm(`${n} を消します(元に戻せません)。よいですか?`)) return
    await FilesApi.remove(n)
    if (n === current) {
      setCurrent(null)
      setName('')
      setContent('')
      setSaved('')
    }
    await refresh()
    onChanged?.()
  }

  const pin = async (n: string, v: boolean) => {
    await FilesApi.pin(n, v)
    await refresh()
    onChanged?.()
  }

  // PC から上げる(Markdown・SQL・テキスト・CSV はそのまま。Excel はシートごとの表の形にして .md に)
  const onUpload = async (f: File) => {
    setError('')
    if (/\.(xlsx|xlsm)$/i.test(f.name)) {
      const n = f.name.replace(/\.(xlsx|xlsm)$/i, '.md')
      const r = await FilesApi.fromXlsx(n, toBase64(await f.arrayBuffer()))
      if (isFailure(r)) return setError(r.error)
      await refresh()
      await openFile(n)
      onChanged?.()
      return
    }
    if (!/\.(md|sql|txt|csv)$/i.test(f.name)) return setError('上げられるのは .md / .sql / .txt / .csv / .xlsx です')
    if (files.some((x) => x.name === f.name) && !window.confirm(`${f.name} は、もうあります。上書きしますか?`)) return
    const text = await f.text()
    const r = await FilesApi.save(f.name, text)
    if (isFailure(r)) return setError(r.error)
    await refresh()
    await openFile(f.name)
    onChanged?.()
  }

  const currentFile = files.find((f) => f.name === current)
  const dirty = content !== saved || (current !== null && name.trim() !== current)

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: '1100px', width: '94vw' }}>
        <DialogBody>
          <DialogTitle>作業ファイル</DialogTitle>
          <DialogContent>
            <div className={s.row} style={{ marginBottom: '8px' }}>
              <span className={mergeClasses(s.muted, s.grow)}>
                Workbench の server/devwork/files/ に残ります(Git には入りません)。「いつも AI に渡す」を入れたファイルは、会話のたびに AI が読みます(コーディングルール・引き継ぎ)。
              </span>
              <Button
                size="small"
                icon={<AddRegular />}
                onClick={() => {
                  setCurrent(null)
                  setName('')
                  setContent('')
                  setSaved('')
                }}
              >
                新しいファイル
              </Button>
              <Button size="small" icon={<ArrowUploadRegular />} onClick={() => upload.current?.click()}>
                PC から上げる
              </Button>
              <input
                ref={upload}
                type="file"
                accept=".md,.sql,.txt,.csv,.xlsx,.xlsm"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void onUpload(f)
                }}
              />
            </div>
            {error && (
              <MessageBar intent="error" layout="multiline" style={{ marginBottom: '8px' }}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            <div className={s.body}>
              <div className={s.list}>
                {files.length === 0 && <span className={s.muted}>まだファイルはありません</span>}
                {files.map((f) => (
                  <div key={f.name} className={mergeClasses(s.line, f.name === current && s.itemOn)}>
                    <button type="button" className={s.item} onClick={() => void openFile(f.name)} title={f.name}>
                      <span className={s.name}>
                        {f.pinned && (
                          <Badge size="small" appearance="filled" color="brand">
                            いつも
                          </Badge>
                        )}
                        {f.name}
                      </span>
                      <span className={s.meta}>
                        {new Date(f.updated).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}・{bytesLabel(f.size)}
                      </span>
                    </button>
                    {/* 行の「…」: 開かずに、ダウンロード・いつも渡す・削除(BigQuery のコンソールと同じ形) */}
                    <Menu positioning="below-end">
                      <MenuTrigger disableButtonEnhancement>
                        <Button size="small" appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={`${f.name} の操作`} />
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          <MenuItem
                            icon={<ArrowDownloadRegular />}
                            onClick={async () => {
                              const r = await FilesApi.get(f.name)
                              if (!isFailure(r)) download(f.name, r.content)
                            }}
                          >
                            ダウンロード
                          </MenuItem>
                          <MenuItem icon={<PinRegular />} onClick={() => void pin(f.name, !f.pinned)}>
                            {f.pinned ? 'いつも AI に渡す、をやめる' : 'いつも AI に渡す'}
                          </MenuItem>
                          <MenuItem icon={<DeleteRegular />} onClick={() => void remove(f.name)}>
                            削除
                          </MenuItem>
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  </div>
                ))}
              </div>
              <div className={s.edit}>
                <div className={s.row}>
                  <Input className={s.grow} size="small" value={name} placeholder="ファイル名(.md / .sql / .txt / .csv)" onChange={(_, d) => setName(d.value)} />
                  {currentFile && (
                    <Switch label="いつも AI に渡す" checked={currentFile.pinned} onChange={(_, d) => void pin(currentFile.name, d.checked)} />
                  )}
                </div>
                <Textarea className={s.text} resize="vertical" value={content} onChange={(_, d) => setContent(d.value)} placeholder="中身(Markdown・SQL など)" />
                <div className={s.row}>
                  <Button size="small" appearance="primary" icon={<SaveRegular />} disabled={!name.trim() || !dirty} onClick={() => void save()}>
                    保存
                  </Button>
                  <CopyButton text={() => content} />
                  <Button size="small" icon={<ArrowDownloadRegular />} disabled={!content} onClick={() => download(name.trim() || 'file.txt', content)}>
                    ダウンロード
                  </Button>
                  {current && (
                    <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => void remove(current)}>
                      消す
                    </Button>
                  )}
                  {dirty && <span className={s.muted}>保存していない変更があります</span>}
                </div>
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>閉じる</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
