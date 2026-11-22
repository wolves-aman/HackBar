/**
 * DevTools 入口：注册一个和侧边栏完全相同的面板。
 * tabId 通过 query 传给面板，这样“载入当前页”指的是被检查的标签页。
 */

const tabId = chrome.devtools?.inspectedWindow?.tabId ?? ''

chrome.devtools.panels.create('HackBar', '', `panel.html?tabId=${tabId}`)
