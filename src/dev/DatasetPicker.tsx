import { useEffect, useMemo, useState } from 'react'
import { Button, Combobox, Option, makeStyles } from '@fluentui/react-components'
import { DevApi, isFailure } from './api'

const useStyles = makeStyles({
  row: { display: 'flex', alignItems: 'center', gap: '6px' },
  box: { flexGrow: 1, minWidth: 0 },
  // 候補は、入力欄より広く(プロジェクト.データセットの名前が折り返さないように)
  listbox: { minWidth: 'max-content', maxWidth: '520px', maxHeight: '60vh' },
})

// 候補に出す数の上限(多すぎると、一覧が重くなる。絞り込めば出てくる)
const LIMIT = 100

interface Props {
  value: string
  /** よく見るデータセット(候補の先頭に出す) */
  recent: string[]
  onOpen: (dataset: string) => void
  busy?: boolean
}

/**
 * データセットを、名前の一部で探して開く。
 * 「ctlg」のように打てば、接続しているプロジェクトのデータセットから、名前に含むものを出す。
 * 「プロジェクト名の一部」を打てば、プロジェクトも候補に出し、選ぶとそのプロジェクトのデータセットを読む
 */
export function DatasetPicker({ value, recent, onOpen, busy }: Props) {
  const s = useStyles()
  const [text, setText] = useState(value)
  const [projects, setProjects] = useState<string[]>([])
  const [home, setHome] = useState<string | null>(null)
  // プロジェクト → データセットの名前(読んだものだけ)
  const [datasets, setDatasets] = useState<Record<string, string[]>>({})

  const load = async (project: string) => {
    if (datasets[project]) return
    const r = await DevApi.datasets(project)
    if (!isFailure(r)) setDatasets((d) => ({ ...d, [r.project]: r.datasets }))
  }

  useEffect(() => {
    let alive = true
    void (async () => {
      const r = await DevApi.projects()
      if (!alive || isFailure(r)) return
      setProjects(r.projects)
      setHome(r.default)
      if (r.default) {
        const d = await DevApi.datasets(r.default)
        if (alive && !isFailure(d)) setDatasets((x) => ({ ...x, [d.project]: d.datasets }))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // 「プロジェクト.」まで打ったら、そのプロジェクトのデータセットを読む
  const typedProject = text.includes('.') ? text.slice(0, text.indexOf('.')).trim() : ''
  useEffect(() => {
    if (!typedProject || datasets[typedProject] || !projects.includes(typedProject)) return
    const id = window.setTimeout(() => void load(typedProject), 250)
    return () => window.clearTimeout(id)
    // load は datasets を見るだけ(読み直しは要らない)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedProject, projects])

  const options = useMemo(() => {
    const q = text.trim().toLowerCase()
    const all = Object.entries(datasets).flatMap(([p, ds]) => ds.map((d) => `${p}.${d}`))
    const out: { value: string; label: string }[] = []
    const seen = new Set<string>()
    const push = (v: string, label = v) => {
      if (seen.has(v)) return
      seen.add(v)
      out.push({ value: v, label })
    }
    // 前に開いたもの → 名前に含むデータセット(接続しているプロジェクトが先)→ 名前に含むプロジェクト
    recent.filter((d) => !q || d.toLowerCase().includes(q)).forEach((d) => push(d, `${d}(前に開いた)`))
    const tail = (v: string) => v.slice(v.indexOf('.') + 1).toLowerCase()
    const matches = all.filter((d) => {
      if (!q) return true
      if (typedProject) return d.toLowerCase().startsWith(`${typedProject.toLowerCase()}.`) && tail(d).includes(q.slice(typedProject.length + 1))
      return tail(d).includes(q) || d.toLowerCase().includes(q)
    })
    matches.sort((a, b) => Number(!a.startsWith(`${home}.`)) - Number(!b.startsWith(`${home}.`)) || a.localeCompare(b))
    matches.forEach((d) => push(d))
    if (!typedProject) projects.filter((p) => !q || p.toLowerCase().includes(q)).forEach((p) => push(`${p}.`, `${p}.(プロジェクト。選ぶとデータセットを読む)`))
    return out.slice(0, LIMIT)
  }, [text, datasets, recent, projects, home, typedProject])

  const open = (v: string) => {
    const name = v.trim().replace(/`/g, '')
    if (!name) return
    // データセットだけ打ったときは、接続しているプロジェクトのものとして開く
    onOpen(name.includes('.') || !home ? name : `${home}.${name}`)
  }

  return (
    <div className={s.row}>
      <Combobox
        className={s.box}
        size="small"
        freeform
        listbox={{ className: s.listbox }}
        value={text}
        placeholder="データセット名の一部(例: ctlg)"
        onChange={(e) => setText((e.target as HTMLInputElement).value)}
        onOptionSelect={(_, d) => {
          const v = d.optionValue ?? ''
          if (!v) return
          if (v.endsWith('.')) {
            // プロジェクトを選んだ: データセットを読んで、続けて絞り込めるように
            setText(v)
            void load(v.slice(0, -1))
            return
          }
          setText(v)
          open(v)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          // 候補が 1 つだけなら、それを開く(名前の一部を打って Enter で開けるように)
          const only = options.filter((o) => !o.value.endsWith('.'))
          if (only.length === 1 && !text.includes('.')) {
            setText(only[0].value)
            open(only[0].value)
          } else open(text)
        }}
      >
        {options.map((o) => (
          <Option key={o.value} value={o.value} text={o.value}>
            {o.label}
          </Option>
        ))}
      </Combobox>
      <Button size="small" appearance="primary" onClick={() => open(text)} disabled={busy || !text.trim()}>
        開く
      </Button>
    </div>
  )
}
