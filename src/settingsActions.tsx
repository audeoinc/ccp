import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Spinner, makeStyles, tokens } from '@fluentui/react-components'
import {
  AlertRegular,
  ArrowDownloadRegular,
  ArrowSyncRegular,
  ArrowUploadRegular,
  AttachRegular,
  BeakerRegular,
  CalendarClockRegular,
  DeleteRegular,
  DocumentBulletListRegular,
  ImageMultipleRegular,
  LayoutColumnTwoRegular,
  LightbulbFilamentRegular,
  LightbulbRegular as DevRequestIcon,
  PeopleTeamRegular,
  SendRegular,
  ShieldCheckmarkRegular,
  QuestionCircleRegular,
  ToggleLeftRegular,
} from '@fluentui/react-icons'
import type { SettingsAction } from './SettingsDialog'
import {
  BrandPanel,
  CountryCriteriaPanel,
  CountryLearningsPanel,
  CountryPoliciesPanel,
  CountryTemplatesPanel,
  DevRequestsDialog,
  FeaturesManager,
  HelpFaqAdmin,
  HeroLibrary,
  Later,
  PatternPanel,
  PeopleManager,
  PolicyManager,
  SampleShopPanel,
  TemplateSettingsPane,
} from './lazyViews'
import { AiIcon } from './AiMark'
import { DeliveryCardsService } from './data/deliveryCards'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { createAdSamples, createImpactSamples } from './gcp/samples'
import { importMetricsCsv } from './data/metricsImport'
import type { BqSyncResult } from './gcp/bq'
import type { LoadPart, Notice } from './useAppData'
import { downloadPack, megabytes } from './exportPack'
import { importProductImagesZip } from './productImageImport'
import { clearProductMetricsCache } from './useProductMetrics'
import { clearProductSkusCache } from './useProductSkus'
import { createAbExamples, isAbSeed } from './abSeed'
import { createSampleSkus, removeSampleSkus } from './skuSample'
import { countAssetExamples, createAssetExamples, removeAssetExamples } from './assetSeed'
import { createUsSamplePatterns } from './samplePatterns'
import { classifyThemeTypes } from './themeTypes'
import { myName } from './history'
import { confirmDialog } from './confirm'
import { locale, tr, useT } from './i18n'

const useStyles = makeStyles({
  exportDone: { color: tokens.colorPaletteGreenForeground1 },
  exportError: { color: tokens.colorPaletteRedForeground1 },
})

/** ⚙ に出す、在庫のデータの時点(BigQuery 側。取り込んだ時刻ではない) */
function bqStockTime(r: BqSyncResult): string | undefined {
  const at = r.outputs.find((o) => o.name === 'sku_stock')?.dataAsOf
  return at ? tr('在庫 ', 'Stock ') + new Date(at).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : undefined
}

/**
 * ⚙(設定の画面)に並べる操作(App から分けた。整理 第 3 段)。国・全社の設定の欄と、開発・管理の取り込み・書き出し・見本の作成。
 * 操作の様子(書き出し中・SKU を作っている間・種類を分けている間)は、ここで持つ。fileInput は、指標の CSV を選ぶ隠れた欄(画面のどこかに置く)
 */
export function useSettingsActions(ctx: {
  cards: DeliveryCard[]
  /** 取りやめを除いた、画面の国の配信(素材の見本を足す先) */
  activeCards: DeliveryCard[]
  products: Product[]
  heroes: HeroImage[]
  /** 画面の国('' = すべての国) */
  country: string
  bq: BqSyncResult | null
  bqBusy: boolean
  runBqSync: (force: boolean) => Promise<void>
  loadProducts: () => Promise<boolean>
  loadPatterns: () => Promise<void>
  loadMarketingPolicies: () => Promise<void>
  load: () => Promise<void>
  loadParts: (parts: readonly LoadPart[]) => Promise<void>
  reloadHeroes: () => Promise<void>
  notify: (n: Notice) => void
  /** 効果の見本を作り直した(見せ方「効果」を読み直す) */
  onImpactChanged: () => void
  onOpenCard: (id: string) => void
}): { actions: SettingsAction[]; fileInput: ReactNode } {
  const { cards, activeCards, products, heroes, country, bq, bqBusy, runBqSync, loadProducts, loadPatterns, loadMarketingPolicies, load, loadParts, reloadHeroes, notify: setBqNotice, onImpactChanged, onOpenCard: setSelectedId } = ctx
  const styles = useStyles()
  const t = useT()
  // ⚙ の「データと画像を書き出す」の様子(作っている間は何も届かないので、押したことと進み具合を、その行に出す)
  const [exportState, setExportState] = useState<{ kind: 'working'; bytes: number } | { kind: 'done'; bytes: number } | { kind: 'error'; message: string } | null>(null)
  // 見本の SKU を作っている間(X63。数千行になることがあるので、終わるまで押せなくする)
  const [skuBusy, setSkuBusy] = useState(false)
  // 種類(テーマの種類)が決まっていない配信を、AI で分ける(X41)。国の設定にかかわらず、すべての配信が対象
  const untypedCards = useMemo(() => cards.filter((c) => !c.theme_type), [cards])
  const [classifying, setClassifying] = useState(false)
  const classifyAll = async () => {
    setClassifying(true)
    try {
      let done = 0
      // 一度に多く渡すと、返答が途中で切れることがあるので、20 本ずつ
      for (let i = 0; i < untypedCards.length; i += 20) {
        const types = await classifyThemeTypes(untypedCards.slice(i, i + 20))
        for (const [id, type] of types) if ((await DeliveryCardsService.update(id, { theme_type: type })).success) done++
      }
      await loadParts(['cards'])
      setBqNotice({ intent: 'success', text: tr(`${done} 本の配信の種類を、AI が分けました`, `AI sorted the type of ${done} deliveries`) })
    } catch (e) {
      setBqNotice({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setClassifying(false)
    }
  }
  // 商品・カテゴリの週の指標の CSV の取り込み(X48)。週 × 市場ごとに置き換え、商品のフロートの「指標」に出す
  const metricsFileRef = useRef<HTMLInputElement>(null)
  const importMetrics = async (file: File) => {
    const r = await importMetricsCsv(file.name, await file.text())
    clearProductMetricsCache()
    const skipped = (r.problems ?? []).slice(0, 5).map((x) => `${x.line}: ${x.message}`).join(' / ')
    const kind = r.kind === 'category' ? tr('カテゴリ', 'category') : tr('商品', 'product')
    if (r.error) setBqNotice({ intent: 'error', text: tr(`指標を取り込めませんでした: ${r.error}`, `Could not import metrics: ${r.error}`) + (skipped ? ` (${skipped})` : '') })
    else
      setBqNotice({
        intent: skipped ? 'warning' : 'success',
        text:
          tr(`${kind}の指標を ${r.count ?? 0} 行取り込みました(${(r.weeks ?? []).map((w) => `${w.week_start} ${w.market}`).join('・')})`, `Imported ${r.count ?? 0} ${kind} metric rows (${(r.weeks ?? []).map((w) => `${w.week_start} ${w.market}`).join(', ')})`) +
          (skipped ? tr(`。読めなかった行: ${skipped}`, `. Skipped: ${skipped}`) : ''),
      })
  }
  const actions: SettingsAction[] = [
    {
      id: 'countryPolicies',
      section: 'country',
      label: t('使う決まり', 'Rules used'),
      description: t('全社の決まりのうち、この国で使うものを選びます。この国の AI の依頼と週の上限に効きます。', 'Choose which company rules apply in this country. Affects AI requests and weekly limits here.'),
      icon: <ShieldCheckmarkRegular />,
      info: t(
        'マーケティングの決まりは全部の国で共通です。決めていなければ、決まりの「市場」のとおりに使います(空ならブランド全体の決まりとして全部の国、書いてあればその国だけ)。印を変えると、この国の AI の依頼と週の上限に効きます(この国の全員に効きます)。中身が国で違う決まりは、ここでは表せないので、全社の「方針・決まり」で別の決まりとして足してください。',
        'Marketing rules are shared across countries. Undecided rules follow their Market column (empty = brand-wide, used everywhere; otherwise only those countries). Changing a check affects this country’s AI requests and weekly limits (applies to everyone on this country). Rules whose content differs by country cannot be expressed here — add them as separate rules in Company → Marketing policies.',
      ),
      render: (co, name) => <Later spin><CountryPoliciesPanel country={co} countryName={name} /></Later>,
    },
    {
      id: 'criteria',
      section: 'country',
      label: t('アラートの基準', 'Alert criteria'),
      description: t('在庫僅少の週数・週の上限・販売順位の上位の線。この国の全員に効きます。', 'Low-stock weeks, weekly limit and top-ranking line. Applies to everyone on this country.'),
      icon: <AlertRegular />,
      info: t(
        '何を問題とみなすかの、国の基準です。変えると、この国の配信を扱う全員に効きます(変えた人・日時が残ります)。どのアラートを自分に出すか(種類・担当など)は、アラートの画面の「条件」で人ごとに決めます。',
        'The country’s criteria for what counts as a problem. Changes apply to everyone working on this country (who and when are recorded). Which alerts you personally see (types, owners…) is set per person in the Alerts page “Conditions”.',
      ),
      render: (co, name) => <Later spin><CountryCriteriaPanel country={co} countryName={name} /></Later>,
    },
    {
      id: 'countryTemplates',
      section: 'country',
      label: t('使うテンプレート', 'Templates used'),
      description: t('全社のテンプレートのうち、この国で使うものを選びます。', 'Choose which company templates are used in this country.'),
      icon: <LayoutColumnTwoRegular />,
      info: t(
        'テンプレートは全部の国で共通です。印を外すと、この国の配信・まとめて作る・配信の型・AI の選定の選択肢に出なくなります(この国の全員に効きます)。すでにこのテンプレートを使った配信は、そのまま描けます。まだ決めていないものは、使います。',
        'Templates are shared across countries. Unchecking hides a template from this country’s deliveries, bulk creation, delivery patterns and AI choices (applies to everyone on this country). Deliveries that already use it still render. Undecided templates are used.',
      ),
      render: (co, name) => <Later spin><CountryTemplatesPanel country={co} countryName={name} /></Later>,
    },
    {
      id: 'countryLearnings',
      section: 'country',
      label: t('使う学び', 'Learnings used'),
      description: t('過去の配信の「次に生かすメモ」のうち、この国で使うものを選びます。ほかの国の学びは、決めていなければ使いません。', 'Choose which notes from past deliveries are used here. Learnings from other countries are off unless you turn them on.'),
      icon: <LightbulbFilamentRegular />,
      info: t(
        '学びは全部の国で共通です。この国の学びは、決めていなければ使います。ほかの国の学びは、国で客層が違うので、決めていなければ使いません(使えそうなものに印を付けます)。印の付いた学びだけが、この国の配信カードの「これまでの学び」と AI の下書きに渡ります(この国の全員に効きます)。残す・様子を見る・外すの判定は、結果の面の「効果」→「学びの評価」で、国ごとに決めます。',
        'Learnings are shared across countries. This country’s own learnings are used unless you decide otherwise. Learnings from other countries are not used unless you check them, since audiences differ. Only checked learnings appear in this country’s delivery cards and AI drafts (applies to everyone on this country). Keep / watch / retire is decided per country in Results → Impact → Evaluate learnings.',
      ),
      render: (co, name) => <Later spin><CountryLearningsPanel country={co} countryName={name} cards={cards} /></Later>,
    },
    {
      id: 'patterns',
      section: 'country',
      label: t('配信の型', 'Delivery patterns'),
      description: t('曜日・時刻・チャネル・種類・テンプレートの組。「まとめて作る」が、この型どおりに枠を作ります。', 'Day, time, channel, type and template. Bulk creation makes slots from these.'),
      icon: <CalendarClockRegular />,
      info: t(
        '毎週の決まった配信を、曜日ごとに「型」として持ちます。「新規作成 ▾」の「まとめて作る」は、この型どおりに枠(種類・テンプレートが入った状態)を作ります。型は既定値なので、作った枠・配信では自由に変えられます。型を変えても、もう作った配信は変わりません。テンプレートは、作るときの最新の版を使います。',
        'Weekly deliveries, kept as patterns per weekday. “Create in bulk” makes slots from these patterns (with type and template filled in). Patterns are only defaults: you can change any slot or delivery. Changing a pattern does not change deliveries already made. Templates use their latest version at creation.',
      ),
      render: (co) => <Later spin><PatternPanel country={co} onChanged={() => void loadPatterns()} /></Later>,
    },
    {
      id: 'countryBrand',
      section: 'country',
      label: t('差出人の名前・店の URL・計測用の値(utm)', 'Sender name, shop URL, and tracking values (utm)'),
      description: t('全社の既定を、この国だけ変えるときに入れます。空の欄は全社の値を使います。', 'Override the company defaults for this country. Empty fields use the company values.'),
      icon: <SendRegular />,
      render: (co, name) => <Later spin><BrandPanel country={co} countryName={name} /></Later>,
    },
    {
      id: 'brand',
      section: 'company',
      label: t('差出人の名前・店の URL・計測用の値(utm)', 'Sender name, shop URL, and tracking values (utm)'),
      description: t('受信箱・メールの上の帯・アプリの通知に出す差出人の名前と、リンクの既定・商品のページの元になる店の URL、すべてのリンクに付ける utm_source・utm_medium(メール・アプリ)。国で上書きできます。', 'The sender name shown in the inbox, the email header and app notifications, the shop URL used for default links and product pages, and the utm_source and utm_medium (email and app) added to every link. Countries can override them.'),
      icon: <SendRegular />,
      render: () => <Later spin><BrandPanel country="" /></Later>,
    },
    {
      id: 'policies',
      section: 'company',
      label: t('方針・決まり', 'Marketing policies'),
      description: t('マーケティングの決まりを取り込む・一覧で見る・直す。決まりは全部の国で共通で、どの国で使うかは「国」の「使う決まり」で決めます。', 'Import, list and edit marketing rules. Rules are shared; which countries use them is set under Country → Rules used.'),
      icon: <DocumentBulletListRegular />,
      render: () => <Later spin><PolicyManager open inline onImported={() => void loadMarketingPolicies()} /></Later>,
    },
    {
      id: 'templates',
      section: 'company',
      label: t('テンプレート', 'Templates'),
      description: t('テンプレートを作る・直す。どの国で使うかは「国」の「使うテンプレート」で決めます。', 'Create and edit templates. Which countries use them is set under Country → Templates used.'),
      icon: <LayoutColumnTwoRegular />,
      // 設定の画面の中では編集の場所が狭いので、選んだら別の大きなフロートで開く(2026-10-26 利用者の要望。TemplateFloat)
      render: () => <Later spin><TemplateSettingsPane cards={cards} products={products} country={country || undefined} onChanged={load} onOpenCard={setSelectedId} /></Later>,
    },
    {
      id: 'heroLibrary',
      section: 'company',
      label: t('画像のライブラリ', 'Image library'),
      description: t('メイン画像・部品の画像。上げる・直す・期限・消す。', 'Hero and part images: upload, edit, expiry, delete.'),
      icon: <ImageMultipleRegular />,
      render: () => <Later spin><HeroLibrary inline heroes={heroes} cards={cards} country={country} me={myName()} onChanged={reloadHeroes} /></Later>,
    },
    {
      id: 'people',
      section: 'company',
      label: t('ユーザーと承認グループ', 'Users and approval groups'),
      description: t('使う人と、承認するグループ。', 'People and approval groups.'),
      icon: <PeopleTeamRegular />,
      render: () => <Later spin><PeopleManager inline /></Later>,
    },
    {
      id: 'bq',
      section: 'data',
      label: bqBusy ? t('BigQuery から取り込み中…', 'Importing from BigQuery…') : t('BigQuery から取り込む', 'Import from BigQuery'),
      description: t('在庫・商品のデータを、すぐに読み直します(開いたときにも自動で確かめます)。', 'Re-read stock and product data now (also checked automatically on open).'),
      icon: <ArrowSyncRegular />,
      disabled: bqBusy,
      secondary: (bq && bqStockTime(bq)) ?? '',
      hidden: !bq?.configured,
      onOpen: () => void runBqSync(true),
    },
    {
      id: 'metrics',
      section: 'data',
      label: t('商品・カテゴリの指標を取り込む(CSV)', 'Import product & category metrics (CSV)'),
      description: t('商品・カテゴリの週の指標の CSV を取り込みます。', 'Import a CSV of weekly product and category metrics.'),
      icon: <ArrowUploadRegular />,
      onOpen: () => metricsFileRef.current?.click(),
    },
    {
      id: 'export',
      section: 'data',
      label: t('データと画像を書き出す(別の環境へ移す)', 'Export data and images (to another environment)'),
      // 右には短い様子だけを出し、長い説明・失敗の理由は説明の行に出す(右が長いと、見出しの欄が細くなるため)
      description:
        exportState?.kind === 'working'
          ? t('写真が多いと 1 分ほどかかります。この窓を閉じても続き、できたら保存されます。', 'This takes about a minute with many photos. It continues if you close this window and saves when ready.')
          : exportState?.kind === 'error'
            ? exportState.message
            : t('すべてのデータと画像を 1 つの ZIP に書き出します(外にアクセスできない環境へ移すため)。', 'Export all data and images to one ZIP (to move to an offline environment).'),
      icon: <ArrowDownloadRegular />,
      disabled: exportState?.kind === 'working',
      secondary:
        exportState?.kind === 'working' ? (
          <Spinner
            size="extra-tiny"
            label={
              exportState.bytes
                ? t(`受け取っています… ${megabytes(exportState.bytes)}`, `Downloading… ${megabytes(exportState.bytes)}`)
                : t('書き出しています…', 'Exporting…')
            }
          />
        ) : exportState?.kind === 'done' ? (
          <span className={styles.exportDone}>{t(`書き出しました(${megabytes(exportState.bytes)})`, `Exported (${megabytes(exportState.bytes)})`)}</span>
        ) : exportState?.kind === 'error' ? (
          <span className={styles.exportError}>{t('書き出せませんでした', 'Export failed')}</span>
        ) : (
          t('ZIP', 'ZIP')
        ),
      onOpen: async () => {
        setExportState({ kind: 'working', bytes: 0 })
        try {
          const { bytes } = await downloadPack((b) => setExportState({ kind: 'working', bytes: b }))
          setExportState({ kind: 'done', bytes })
        } catch (e) {
          setExportState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
        }
      },
    },
    {
      id: 'classify',
      section: 'data',
      label: classifying ? t('種類を分けています…', 'Sorting types…') : t('種類が未設定の配信を、AI で分ける', 'Sort untyped deliveries with AI'),
      description: t('種類(テーマの種類)が決まっていない配信を、AI で分けます。決まっている配信は変えません。', 'Sort deliveries without a theme type using AI. Deliveries with a type are not changed.'),
      icon: <AiIcon size={16} />,
      disabled: classifying || untypedCards.length === 0,
      secondary: t(`${untypedCards.length} 本`, `${untypedCards.length}`),
      onOpen: () => void classifyAll(),
    },
    {
      id: 'photoZip',
      section: 'data',
      label: t('商品・メイン画像の写真の ZIP を取り込む', 'Import a product or hero photo ZIP'),
      description: t('AI で作った見本の写真や、集めた商品ページの画像の ZIP を取り込みます。', 'Import a ZIP of sample photos or collected product page images.'),
      icon: <ImageMultipleRegular />,
      onOpen: async () => {
        try {
          const done = await importProductImagesZip()
          if (!done) return
          await loadProducts()
          setBqNotice({ intent: 'success', text: done })
        } catch (e) {
          setBqNotice({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
        }
      },
    },
    {
      id: 'sampleAds',
      section: 'samples',
      label: t('外部広告の見本を作る', 'Create sample ad data'),
      icon: <ArrowSyncRegular />,
      onOpen: async () => {
        if (!(await confirmDialog(tr('外部広告の見本のデータを作り直します(前に作った見本は置き換わります。取り込んだ本物のデータは消しません)。よろしいですか?', 'Recreate sample ad data? Previous sample rows are replaced; imported data is kept.')))) return
        try {
          const json = await createAdSamples()
          setBqNotice(json.success ? { intent: 'success', text: tr(`外部広告の見本を ${json.data?.rows ?? 0} 行作りました`, `Created ${json.data?.rows ?? 0} rows of sample ad data`) } : { intent: 'error', text: tr('外部広告の見本を作れませんでした', 'Could not create sample ad data') })
        } catch (e) {
          setBqNotice({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
        }
      },
    },
    {
      id: 'sampleImpact',
      section: 'samples',
      label: t('効果の見本を作る', 'Create sample impact data'),
      icon: <ArrowSyncRegular />,
      onOpen: async () => {
        if (!(await confirmDialog(tr('配信の効果の見本(AI に渡した学びの記録・ホールドアウトとの比べ)を作り直します。前に作った見本は置き換わります。画面から記録した本物の記録は消しません。よろしいですか?', 'Recreate sample impact data (learnings log and holdout comparisons)? Previous sample rows are replaced; real records are kept.')))) return
        try {
          const json = await createImpactSamples()
          setBqNotice(json.success ? { intent: 'success', text: tr(`配信 ${json.data?.lifts ?? 0} 本の効果の見本を作りました`, `Created sample impact data for ${json.data?.lifts ?? 0} deliveries`) } : { intent: 'error', text: tr('効果の見本を作れませんでした', 'Could not create sample impact data') })
          onImpactChanged()
        } catch (e) {
          setBqNotice({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
        }
      },
    },
    {
      id: 'sampleAssets',
      section: 'samples',
      label: t('素材の見本を作る', 'Create sample assets'),
      icon: <AttachRegular />,
      onOpen: async () => {
        try {
          const have = await countAssetExamples()
          const msg = have
            ? tr(`素材の見本はすでに ${have} 件あります。もう一組作りますか?`, `${have} sample assets already exist. Create another set?`)
            : tr('制作に渡した配信を先に、2〜3 本に素材の見本(イラスト・PDF・参考の URL)を足します。名前の先頭は「見本:」(US の配信は英語で「Sample:」)です。今ある素材は変えません。よろしいですか?', 'Add sample assets (illustrations, a PDF and reference URLs) to 2–3 deliveries, preferring ones handed off to production. Names start with "Sample:" ("見本:" for Japan deliveries). Existing assets are not changed. Continue?')
          if (!(await confirmDialog(msg))) return
          const r = await createAssetExamples({ cards: activeCards, me: myName() })
          setBqNotice({ intent: 'success', text: tr(`素材の見本を ${r.count} 件、${r.cards.join('・')} に足しました`, `Added ${r.count} sample assets to ${r.cards.join(', ')}`) })
        } catch (e) {
          setBqNotice({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
        }
      },
    },
    {
      id: 'removeAssets',
      section: 'samples',
      label: t('素材の見本を削除', 'Delete sample assets'),
      icon: <DeleteRegular />,
      onOpen: async () => {
        if (!(await confirmDialog(tr('名前の先頭が「見本:」か「Sample:」の素材と、そのファイルを削除します(ほかの素材は削除しません)。よろしいですか?', 'Delete the assets whose names start with "Sample:" or "見本:" and their files (other assets are kept)?')))) return
        try {
          const n = await removeAssetExamples()
          setBqNotice({ intent: 'success', text: tr(`素材の見本を ${n} 件消しました`, `Deleted ${n} sample assets`) })
        } catch (e) {
          setBqNotice({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
        }
      },
    },
    {
      id: 'sampleSkus',
      section: 'samples',
      label: skuBusy ? t('見本の SKU を作っています…', 'Creating sample SKUs…') : t('見本の SKU を作る', 'Create sample SKUs'),
      icon: <BeakerRegular />,
      disabled: skuBusy,
      onOpen: async () => {
        if (!(await confirmDialog(tr('SKU がまだない商品に、見本の SKU(色 × サイズ)と在庫を作ります。在庫の合計は、いまの商品の在庫と同じにします。今ある SKU は変えません。よろしいですか?', 'Create sample SKUs (color × size) and their stock for products without SKUs. Their total matches the current product stock. Existing SKUs are kept. Continue?')))) return
        setSkuBusy(true)
        try {
          const n = await createSampleSkus(products, (done, total) => setBqNotice({ intent: 'warning', text: tr(`見本の SKU を作っています(${done} / ${total})`, `Creating sample SKUs (${done} / ${total})`) }))
          clearProductSkusCache()
          setBqNotice({ intent: 'success', text: n ? tr(`見本の SKU を ${n} 件作りました(商品のフロートの「SKU」のタブで見られます)`, `Created ${n} sample SKUs (see the SKUs tab of a product)`) : tr('どの商品にも SKU があるので、作りませんでした', 'Every product already has SKUs; nothing created') })
        } catch (e) {
          setBqNotice({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
        } finally {
          setSkuBusy(false)
        }
      },
    },
    {
      id: 'removeSkus',
      section: 'samples',
      label: t('見本の SKU を削除', 'Delete sample SKUs'),
      icon: <DeleteRegular />,
      disabled: skuBusy,
      onOpen: async () => {
        if (!(await confirmDialog(tr('見本の SKU と、その在庫を削除します(BigQuery から入れた本物の SKU は削除しません)。よろしいですか?', 'Delete the sample SKUs and their stock (real SKUs from BigQuery are kept)?')))) return
        setSkuBusy(true)
        try {
          const n = await removeSampleSkus((done, total) => setBqNotice({ intent: 'warning', text: tr(`見本の SKU を消しています(${done} / ${total})`, `Deleting sample SKUs (${done} / ${total})`) }))
          clearProductSkusCache()
          setBqNotice({ intent: 'success', text: tr(`見本の SKU を ${n} 件消しました`, `Deleted ${n} sample SKUs`) })
        } catch (e) {
          setBqNotice({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
        } finally {
          setSkuBusy(false)
        }
      },
    },
    {
      id: 'abExamples',
      section: 'samples',
      label: t('AB テスト・案から選ぶの例を作る', 'Create A/B and choose-a-variant examples'),
      icon: <BeakerRegular />,
      onOpen: async () => {
        const already = cards.filter(isAbSeed).length
        const msg = already
          ? tr(`例の配信はすでに ${already} 本あります。もう一組(5 本)作りますか?`, `${already} example deliveries already exist. Create another set (5)?`)
          : tr('AB テスト(B まで・C まで)と、案から選ぶ(B まで・C まで・決めたあと)の例の配信を 5 本作ります。今ある配信は変えません。よろしいですか?', 'Create 5 example deliveries: A/B tests (up to B and C) and choose-a-variant (up to B, up to C, and already decided)? Existing deliveries are not changed.')
        if (!(await confirmDialog(msg))) return
        try {
          const n = await createAbExamples({ products, heroes, owner: myName() })
          setBqNotice({ intent: 'success', text: tr(`例の配信を ${n} 本作りました(8〜15 日後)`, `Created ${n} example deliveries (8–15 days ahead)`) })
          await load()
        } catch (e) {
          setBqNotice({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
        }
      },
    },
    {
      id: 'samplePatterns',
      section: 'samples',
      label: t('配信の型の見本を作る(US)', 'Create sample delivery patterns (US)'),
      icon: <CalendarClockRegular />,
      onOpen: async () => {
        if (!(await confirmDialog(tr('US の配信の型の見本(月〜日の 6 本: メール 4・アプリ 2)を作ります。US の型がもうあれば、何も作りません。よろしいですか?', 'Create sample US delivery patterns (6 per week: 4 emails, 2 app)? Nothing is created if US already has patterns.')))) return
        try {
          const n = await createUsSamplePatterns()
          await loadPatterns()
          setBqNotice(
            n
              ? { intent: 'success', text: tr(`US の配信の型を ${n} 本作りました(⚙ →「国」→「配信の型」で見られます)`, `Created ${n} US delivery patterns (see ⚙ → Country → Delivery patterns)`) }
              : { intent: 'warning', text: tr('US の配信の型はもうあるので、作りませんでした', 'US already has delivery patterns; nothing created') },
          )
        } catch (e) {
          setBqNotice({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
        }
      },
    },
    {
      id: 'sampleShop',
      section: 'shop',
      label: t('見本の商品ページと画像', 'Sample product pages and photos'),
      icon: <ImageMultipleRegular />,
      render: () => <Later spin><SampleShopPanel products={products} /></Later>,
    },
    {
      // 使える機能(X87)。機能ごとの公開・非公開と、版をまとめて当てる
      id: 'features',
      section: 'features',
      label: t('使える機能', 'Features'),
      icon: <ToggleLeftRegular />,
      render: () => <Later spin><FeaturesManager /></Later>,
    },
    {
      // 「？ 聞く」の質問からまとめた、よく聞かれる質問(X82 段 ④)。回数・開発に伝えた数の多い順・隠す・まとめ直す
      id: 'helpFaqs',
      section: 'help',
      label: t('よく聞かれる質問', 'Frequently asked questions'),
      icon: <QuestionCircleRegular />,
      render: () => <Later spin><HelpFaqAdmin /></Later>,
    },
    {
      id: 'devRequests',
      section: 'requests',
      label: t('開発へのリクエストの一覧', 'Requests to developers'),
      description: t('画面のピンから送られた、開発へのリクエストの一覧。', 'Requests to developers sent from pins on the screen.'),
      icon: <DevRequestIcon />,
      render: () => <Later spin><DevRequestsDialog inline /></Later>,
    },
  ]
  const fileInput = (
    <input
      ref={metricsFileRef}
      type="file"
      accept=".csv,text/csv"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) void importMetrics(f)
      }}
    />
  )
  return { actions, fileInput }
}
