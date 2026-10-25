import { Combobox, Option, makeStyles } from '@fluentui/react-components'

const useStyles = makeStyles({
  // Fluent の Combobox は最小の幅が広い(250px)ので、欄の幅に合わせる
  root: { minWidth: 0 },
  input: { width: '100%', minWidth: 0 },
})

/**
 * 人の名前の欄(担当者・宛先など)。これまでに使った名前から選べて、自由にも書ける。
 * Fluent の Combobox(freeform)。以前の Input と datalist の代わり(整理 #11。ブラウザごとに候補の出方が違ったため)
 */
export function PersonInput({ value, onChange, people, placeholder, ariaLabel, className }: {
  value: string
  onChange: (v: string) => void
  people: string[]
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  const s = useStyles()
  const q = value.trim().toLowerCase()
  const names = [...new Set(people.map((p) => p.trim()).filter(Boolean))]
  // 書いた文字を含む名前だけを出す(書いた名前そのものだけのときは、全員を出す: 別の人に替えやすいように)
  const shown = names.some((n) => n.toLowerCase() === q) ? names : names.filter((n) => n.toLowerCase().includes(q))
  return (
    <Combobox
      size="small"
      freeform
      className={className ? `${s.root} ${className}` : s.root}
      input={{ className: s.input }}
      value={value}
      selectedOptions={names.includes(value.trim()) ? [value.trim()] : []}
      onChange={(e) => onChange(e.target.value)}
      onOptionSelect={(_, d) => d.optionText !== undefined && onChange(d.optionText)}
      placeholder={placeholder}
      aria-label={ariaLabel}
    >
      {shown.map((n) => (
        <Option key={n}>{n}</Option>
      ))}
    </Combobox>
  )
}
