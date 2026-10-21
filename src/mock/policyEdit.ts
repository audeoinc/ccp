// 撮影・デモ用: マーケティングの決まりを画面で直す窓口(src/data/policyEdit)の身代わり。メモリ上の表(src/mock/db.ts の tables)を書き換える。
// 確かめは、サーバー(server/ccp/policies.py の check_rule)の主なものだけ(番号・題名・対象・強さ・確かめ方の形)
import { guid } from './seed'
import { tables } from './db'
import { myName } from '../history'
import type { RuleInput, RuleSaveResult } from '../data/policyEdit'

export type { RuleInput, RuleSaveResult }

const SCREEN_FILE = '画面で作成'
const TARGETS = ['theme', 'selection', 'hero', 'headline', 'copy', 'instructions', 'schedule']
const CHECKS = [/^含めない\s+\/.+\/$/, /^含めない\s+\S.*$/, /^含める\s+\/.+\/$/, /^除く\s+段階\s*=\s*\S+$/, /^上限\s+週\s+\d+\s*回$/]
const list = (v: string) => v.split(/[,、，]/).map((x) => x.trim()).filter(Boolean)

function check(r: RuleInput): string | null {
  if (!r.rule_id.trim()) return '決まりの番号を入れてください(例: R-LIMIT-001)'
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(r.rule_id.trim())) return `決まりの番号「${r.rule_id}」に、英数字と - _ 以外が入っています`
  if (!r.title.trim()) return '題名を入れてください'
  const t = list(r.applies_to)
  if (!t.length || t.some((x) => !TARGETS.includes(x))) return '「対象」がありません、または知らない名前があります'
  if (!['must', 'should', 'info'].includes(r.strength)) return '「強さ」は must / should / info です'
  if (r.check_spec?.trim() && !CHECKS.some((c) => c.test(r.check_spec!.trim()))) return `「確かめ方」の書き方が分かりません: ${r.check_spec}`
  if (r.period_start && r.period_end && r.period_start > r.period_end) return '「期間」の始まりが終わりよりあとです'
  return null
}

const row = (r: RuleInput) => ({
  rule_id: r.rule_id.trim(),
  title: r.title.trim(),
  applies_to: list(r.applies_to).join(','),
  strength: r.strength,
  market: list(r.market).map((x) => x.toUpperCase()).join(','),
  channel: list(r.channel).join(','),
  period_start: r.period_start || r.period_end || null,
  period_end: r.period_end || r.period_start || null,
  check_spec: r.check_spec?.trim() || null,
  body: r.body.trim(),
})

const history = (action: string, ruleId: string, before: unknown, after: unknown, sourceFile: unknown) =>
  tables.PolicyRuleEditsService.push({
    id: guid(`rule-edit:${Math.random()}`),
    created_on: new Date().toISOString(),
    rule_id: ruleId,
    action,
    before_value: before ? JSON.stringify(before) : '',
    after_value: after ? JSON.stringify(after) : '',
    actor: myName(),
    source_file: sourceFile,
  })

const problems = (r: RuleInput): RuleSaveResult => ({ problems: r.body.trim() ? [] : [{ message: '本文がありません(題名だけを AI に渡します)' }] })

export const PolicyEdit = {
  async create(r: RuleInput): Promise<RuleSaveResult> {
    const bad = check(r)
    if (bad) throw new Error(bad)
    const rules = tables.PolicyRulesService
    if (rules.some((x) => x.rule_id === r.rule_id.trim())) throw new Error(`決まりの番号「${r.rule_id}」は、もう使われています`)
    const now = new Date().toISOString()
    const created = { id: guid(`rule:${Math.random()}`), created_on: now, ...row(r), source_file: SCREEN_FILE, sort_order: rules.filter((x) => x.source_file === SCREEN_FILE).length, edited_at: now, edited_by: myName() }
    rules.push(created)
    history('create', created.rule_id, null, created, SCREEN_FILE)
    return problems(r)
  },
  async update(id: string, r: RuleInput): Promise<RuleSaveResult> {
    const bad = check(r)
    if (bad) throw new Error(bad)
    const target = tables.PolicyRulesService.find((x) => x.id === id)
    if (!target) throw new Error('決まりが見つかりません')
    if (tables.PolicyRulesService.some((x) => x.id !== id && x.rule_id === r.rule_id.trim())) throw new Error(`決まりの番号「${r.rule_id}」は、ほかの決まりで使われています`)
    const before = { ...target }
    Object.assign(target, row(r), { edited_at: new Date().toISOString(), edited_by: myName(), modified_on: new Date().toISOString() })
    history('update', String(target.rule_id), before, { ...target }, target.source_file)
    return problems(r)
  },
  async remove(id: string) {
    const rules = tables.PolicyRulesService
    const i = rules.findIndex((x) => x.id === id)
    if (i < 0) throw new Error('決まりが見つかりません')
    const [before] = rules.splice(i, 1)
    history('delete', String(before.rule_id), before, null, before.source_file)
    return {}
  },
  async exportMarkdown(sourceFile?: string) {
    const rows = tables.PolicyRulesService.filter((x) => !sourceFile || x.source_file === sourceFile)
    const items = (x: Record<string, unknown>) =>
      [
        ['対象', x.applies_to],
        ['強さ', x.strength],
        ['市場', x.market],
        ['チャネル', x.channel],
        ['期間', x.period_start ? `${x.period_start} - ${x.period_end}` : ''],
        ['確かめ方', x.check_spec],
      ]
        .filter(([, v]) => v)
        .map(([k, v]) => `- ${k}: ${String(v).split(',').join(', ')}`)
        .join('\n')
    const content = `# ${sourceFile || 'CCP のマーケティングの決まり(すべて)'}\n- 版: ${new Date().toISOString().slice(0, 10)}(CCP から書き出し)\n\n` + rows.map((x) => `## ${x.rule_id} ${x.title}\n${items(x)}\n\n${x.body ?? ''}\n`).join('\n')
    return { filename: `${(sourceFile || 'ccp-rules').replace(/\.(md|markdown|txt)$/i, '')}.md`, content, count: rows.length }
  },
}
