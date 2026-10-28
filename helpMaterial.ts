// 「？ 聞く」(X82)の材料を、ビルドのときに作る(Vite のプラグイン。画面からは `virtual:help-material` で読む)。
//   ① 画面の文言の索引: ソースの t('日本語', 'English') と tr(...) を抜き出し、文言(日・英)→ ファイル・部品・画面の場所
//   ② 文書: docs/FEATURES.md・docs/SOURCE_MAP.md・docs/FEATURE_REASONS.md を見出しごとに分けたもの
// ビルドのたびに作るので、いつもいまのコードと文書どおりになる(手で書いた一覧は古くなる)。
// 文書の <!-- hosted --> の印の付いた所は、ここでも消す(Workbench の版の文書と同じ中身にする)。
// 画面は、「？ 聞く」を開いたときにだけ読み込む(別のファイルに分かれる)ので、ふだんの読み込みは重くならない
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

const VIRTUAL = 'virtual:help-material'
const RESOLVED = '\0' + VIRTUAL
const DOCS = ['FEATURES.md', 'SOURCE_MAP.md', 'FEATURE_REASONS.md']
// 長い節は分ける(当たりを付けて渡すときに、関係のない所までまとめて渡さないように)
const SECTION_MAX = 3000

/** 画面の文言 1 つ: [日本語, English, ファイル(src/ から), 部品, 画面の場所(screens の番号。-1 = 分からない)] */
export type HelpLabel = [string, string, string, string, number]
/** 文書の 1 節 */
export interface HelpSection {
  doc: string
  /** 見出しの並び(例: 配信カード › 商品) */
  title: string
  text: string
}

// ファイルの名前から、画面の場所の呼び名(日・英)。上から順に見て、最初に当たったもの。当たらなければ空(部品の名前で足りる)
const SCREENS: [RegExp, string, string][] = [
  [/^simple\//, '配信カード(シンプル)', 'Delivery card (simple)'],
  [/^dev\//, '開発用の画面', 'Developer screen'],
  [/AppToolbar|appToolbar|InboxButton|MePicker/, '上の帯', 'Top bar'],
  [/^Production|production/, '制作', 'Production'],
  [/^(Result|Impact|Learning|AbResult|AbCompare|WeekRetro|WeekCompare)|results|impact|learning/, '結果', 'Results'],
  [/Alert|alert/, 'アラート', 'Alerts'],
  [/Template|template|PartLibrary|PartPicker|PartUpload/, 'テンプレート', 'Templates'],
  [/Settings|settings|People|Policy|Rule|Country|Brand|SampleShop/, '設定(⚙)', 'Settings (⚙)'],
  [/Bulk|bulk/, 'まとめて作る', 'Create in bulk'],
  [/^Week|week/, '週の表示', 'Week view'],
  [/^(Calendar|MiniCalendar|MonthSummary|ListView)/, 'カレンダー・一覧', 'Calendar / list'],
  [/^Campaign|campaign/, 'キャンペーン', 'Campaign'],
  [/DevRequest|devRequest/, '開発へのリクエスト', 'Dev requests'],
  [/^(Card|Content|Sections|Links|AppLinks|Hero|Product|Preview|Pin|Comments|Process|Handoff|Approval|Tasks|Chat|CreativeAssets|StageNav|StatusFlow)|cardForm|contentPane/, '配信カード', 'Delivery card'],
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p)
  }
  return out
}

// 文字列の中の \' などを戻す。テンプレート文字列の ${...} は「…」にする(値は画面によって替わる)
const unquote = (s: string) => s.replace(/\$\{[^}]*\}/g, '…').replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()

// t('…', '…') と tr('…', '…')。2 つとも文字の値で書いた所だけ(変数を渡している所は、文言が分からないので読まない)
const CALL = /\b(?:t|tr)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*?)\1\s*,\s*(['"`])((?:\\.|(?!\3)[^\\])*?)\3\s*[,)]/g
const COMPONENT = /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:function\s+([A-Z][A-Za-z0-9]*)|const\s+([A-Z][A-Za-z0-9]*)\s*[:=])/g

export function screenLabels(srcDir: string): HelpLabel[] {
  const seen = new Set<string>()
  const out: HelpLabel[] = []
  for (const path of walk(srcDir)) {
    const file = relative(srcDir, path).split(sep).join('/')
    // 撮影用の差し替え・開発用の画面は、使う人の画面ではないので入れない
    if (/^(mock|dev)\//.test(file)) continue
    const text = readFileSync(path, 'utf8')
    // 部品の名前は、その文言より前で、いちばん近くに始まった部品(関数・定数の名前が大文字で始まるもの)
    const comps: [number, string][] = []
    for (const m of text.matchAll(COMPONENT)) comps.push([m.index ?? 0, m[1] ?? m[2] ?? ''])
    const screen = SCREENS.findIndex(([re]) => re.test(file))
    for (const m of text.matchAll(CALL)) {
      const ja = unquote(m[2])
      const en = unquote(m[4])
      if (!ja || !en) continue
      // AI への指示文など、画面に出ない長い文は入れない(索引はボタン・欄の名前を引くためのもの。.ts の文は短いものだけ)
      if (ja.length > (file.endsWith('.tsx') ? 120 : 40)) continue
      const at = m.index ?? 0
      let comp = ''
      for (const [i, name] of comps) {
        if (i > at) break
        comp = name
      }
      const key = `${ja}\u0000${en}\u0000${file}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push([ja, en, file, comp, screen])
    }
  }
  return out
}

/** 文書の、<!-- hosted --> の印の付いた所を消す(Workbench の版の文書と同じ消し方) */
export function stripHosted(text: string): string {
  let out = text
    .split(/\r?\n/)
    .filter((line) => !/<!--\s*hosted\s*-->/.test(line))
    .join('\n')
  out = out.replace(/<!--\s*hosted:begin\s*-->[\s\S]*?<!--\s*hosted:end\s*-->/g, '')
  return out.replace(/%%\s*hosted:begin[\s\S]*?%%\s*hosted:end/g, '')
}

/** 文書を見出しごとの節に分ける(見出しの並びを題にする) */
export function docSections(doc: string, text: string): HelpSection[] {
  const out: HelpSection[] = []
  const trail: string[] = []
  let body: string[] = []
  const flush = () => {
    const joined = body.join('\n').trim()
    body = []
    if (!joined) return
    const title = trail.filter(Boolean).join(' › ')
    for (let i = 0; i < joined.length; i += SECTION_MAX) out.push({ doc, title, text: joined.slice(i, i + SECTION_MAX) })
  }
  let fence = false
  for (const line of stripHosted(text).split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence
    const h = !fence && /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      flush()
      const level = h[1].length
      trail.length = level - 1
      trail[level - 1] = h[2].trim()
      continue
    }
    body.push(line)
  }
  flush()
  return out
}

export function buildHelpMaterial(root: string): { labels: HelpLabel[]; sections: HelpSection[]; screens: [string, string][] } {
  const labels = screenLabels(join(root, 'src'))
  const sections: HelpSection[] = []
  for (const name of DOCS) {
    try {
      sections.push(...docSections(name, readFileSync(join(root, 'docs', name), 'utf8')))
    } catch {
      // 文書がない所でビルドしても止めない(文書なしで、画面の文言の索引だけで答える)
    }
  }
  return { labels, sections, screens: SCREENS.map(([, ja, en]) => [ja, en]) }
}

/** Vite のプラグイン。`import('virtual:help-material')` で { labels, sections, screens } を返す */
export function helpMaterial(root: string): Plugin {
  return {
    name: 'help-material',
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : null),
    load(id) {
      if (id !== RESOLVED) return null
      return `export default ${JSON.stringify(buildHelpMaterial(root))}`
    },
    // 開発中は、文書・ソースを直したら、次に読み込んだときに作り直す
    handleHotUpdate({ server, file }) {
      if (!/[\\/](docs|src)[\\/]/.test(file)) return
      const mod = server.moduleGraph.getModuleById(RESOLVED)
      if (mod) server.moduleGraph.invalidateModule(mod)
    },
  }
}
