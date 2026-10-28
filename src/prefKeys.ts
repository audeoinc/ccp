// ブラウザ(localStorage)に覚える、人の設定の鍵の一覧(2026-10-24 の整理。以前は使う所ごとに鍵を決めていた)。
// 読み書きは settings.ts の loadPref / savePref(値は JSON)と readRaw / writeRaw(値はそのままの文字)を通す。
// ログインしている人がいれば、書いた値は人ごとの設定としてサーバーにも写る(userPrefs.ts。LOCAL_ONLY_PREFIXES の鍵を除く)。
// 鍵の名前と、保存している値の形は変えない(変えると、覚えていた設定が消える)。形を変えるときは、鍵の版(.v2 など)を上げる
export const PREF = {
  // ---- 表示
  /** 言語('ja' / 'en'。文字のまま) */
  lang: 'ui.lang',
  /** 表示の大きさ(数を文字で) */
  uiScale: 'ui.scale',
  /** 国(X33。どの国の仕事をしているか。'' = すべての国) */
  country: 'ccp.country',
  /** 新規作成・一括作成で最後に選んだ国(ヘッダーが「すべての国」のときの、国の初期値。2026-10-27 利用者) */
  lastNewCountry: 'create.lastCountry',
  calendarView: 'calendar.view',
  weekLens: 'week.lens',
  // 列を足したら、版を上げる(以前に選んだ列の設定では、新しい列が出ないため)
  listColumns: 'list.columns.v2',
  impactPeriod: 'ccp.impactPeriod',
  alertSettings: 'alerts.settings',
  /** 国の設定に移す前に、ブラウザごとに覚えていた販売順位の線(国の設定に 1 回取り込むために読むだけ) */
  legacyRankTopN: 'results.rankTopN',
  chatHeight: 'chat.paneHeight',
  hintsDismissed: 'hints.dismissed',
  pinsShowResolved: 'pins.showResolved',
  /** 開発へのリクエストのピンを出すか(X69 (b)。既定は出す) */
  devRequestPinsVisible: 'devRequests.pinsVisible',
  // ---- 配信カード
  /** 開いたときの自動下書き('on' / 'off'。文字のまま) */
  autoDraft: 'cardDetail.autoDraft',
  cardPreviewZoom: 'cardDetail.previewZoom.v2',
  cardSize: 'cardDetail.size',
  cardPreviewDevice: 'cardDetail.previewDevice',
  // キャンペーンの帯(X79)のテーマ・目的を開いているか(既定は畳む)
  campaignBandOpen: 'cardDetail.campaignBandOpen',
  simplePaneWidths: 'simpleCard.paneWidths.v2',
  simpleProductsOpen: 'simpleCard.productsOpen',
  simpleSidePanel: 'simpleCard.sidePanel',
  simpleHandoffAssetsOpen: 'simpleCard.handoffAssetsOpen',
  // ---- 制作のページ・ほかの窓
  productionInfoOpen: 'productionPage.infoOpen',
  productionTalkOpen: 'productionPage.talkOpen',
  productionSize: 'productionPage.size',
  productionPaneWidths: 'productionPage.paneWidths.v1',
  productionPreviewZoom: 'productionPage.previewZoom',
  bulkPaneWidths: 'bulkWorkspace.paneWidths.v1',
  templateListWidth: 'templateManager.paneWidths.v1',
  assetPaneWidths: 'assetFloat.paneWidths.v1',
  resultPaneWidths: 'resultDetail.paneWidths.v1',
  settingsPaneWidths: 'settings.paneWidths.v1',
  pinFloatSize: 'float.pin.size',
  // ---- 人を見分ける記録(サーバーには写さない)
  myName: 'me.name',
  myUser: 'me.user',
  /** 以前の名前の記録(me.name がないときに読む) */
  legacyCommentAuthor: 'comment.author',
  devRequestName: 'devRequest.name',
} as const

/** フロート(ResizableSurface)の大きさ。フロートの種類ごと */
export const floatSizeKey = (sizeKey: string) => `float.${sizeKey}.size`
/** 複数行の入力欄(AutoTextarea)の高さ。欄の種類ごと */
export const textareaHeightKey = (heightKey: string) => `textarea.${heightKey}.height`

/** 人ごとの設定としてサーバーに写さない鍵(人を見分ける記録・書きかけ・開発用の画面の記録。だれの設定でもなく、そのブラウザのもの) */
export const LOCAL_ONLY_PREFIXES = ['me.', 'comment.author', 'devRequest.', 'ccp-dev-']
