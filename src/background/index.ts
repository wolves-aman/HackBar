/**
 * Service worker：只做两件事——让点击图标打开侧边栏、清理残留的 DNR 会话规则。
 * 真正的发送逻辑跑在面板页里。
 */

async function clearSessionRules(): Promise<void> {
  try {
    const rules = await chrome.declarativeNetRequest.getSessionRules()
    if (rules.length === 0) return
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: rules.map((rule) => rule.id),
    })
  } catch {
    /* ignore */
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined)
  void clearSessionRules()
})

chrome.runtime.onStartup.addListener(() => {
  void clearSessionRules()
})
