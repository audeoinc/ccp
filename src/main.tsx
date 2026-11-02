import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts'
import './index.css'
import Root from './Root.tsx'
import { getLang } from './i18n'
import { startUiScale } from './uiScale'
import { isOn } from './featureFlags'
import { loadUserPrefs } from './userPrefs'
import { watchChunkErrors } from './chunkReload'
import { startHelpRecording } from './help/faq'

// 反映のあとに古いタブで、分けた画面のファイルが読めなかったら、一度だけ読み直す(chunkReload.ts)
watchChunkErrors()
// 「？ 聞く」の質問と答えを、よく聞かれる質問のために保存する(X82 段 ④。だれが聞いたかは送らない)
startHelpRecording()

// ログインしている人の設定(ST6)を、言語・表示の大きさ・ペインの幅などを読む前に入れる(待つのは長くても少し)
void loadUserPrefs().then(() => {
  document.documentElement.lang = getLang()
  // 表示の大きさ(X60)は、最初の描画の前に効かせる(大きさが変わって見えるのを避ける)。
  // 覚えた値がなければ、画面に合わせて決める(settings.me.autoscale。公開の設定は読み込む前なので、版の既定で判定し、非公開と分かったら UiScaleNotice が 100% に戻す)
  startUiScale(isOn('settings.me.autoscale'))

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
})
