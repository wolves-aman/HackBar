<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import RequestPanel from './components/RequestPanel.vue'
import ToolsPanel from './components/ToolsPanel.vue'
import SqliPanel from './components/SqliPanel.vue'
import PayloadPanel from './components/PayloadPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import {
  activeTab,
  clearMessages,
  initState,
  lang,
  loadFromTab,
  refreshTab,
  runtime,
  send,
  settings,
  t,
} from './state'

const tabs = [
  { id: 'request', key: 'tabs.request' },
  { id: 'tools', key: 'tabs.tools' },
  { id: 'sqli', key: 'tabs.sqli' },
  { id: 'payload', key: 'tabs.payload' },
] as const

const lastMessage = computed(() => runtime.messages[0] ?? null)

function applyTheme(): void {
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = settings.theme === 'auto' ? (prefersDark ? 'dark' : 'light') : settings.theme
  document.documentElement.dataset.theme = theme
  document.documentElement.lang = lang.value === 'zh' ? 'zh-CN' : 'en'
}

const media = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

function onMediaChange(): void {
  applyTheme()
}

function onTabActivated(): void {
  void refreshTab()
}

function onKeydown(event: KeyboardEvent): void {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const key = event.key.toLowerCase()
  if (key === 'a') {
    event.preventDefault()
    activeTab.value = 'request'
    void loadFromTab()
  } else if (key === 'x') {
    event.preventDefault()
    activeTab.value = 'request'
    void send()
  }
}

watch([() => settings.theme, lang], applyTheme, { immediate: true })

onMounted(async () => {
  media?.addEventListener('change', onMediaChange)
  window.addEventListener('keydown', onKeydown)
  await initState()
  applyTheme()
  chrome.tabs?.onActivated?.addListener(onTabActivated)
})

onUnmounted(() => {
  media?.removeEventListener('change', onMediaChange)
  window.removeEventListener('keydown', onKeydown)
  chrome.tabs?.onActivated?.removeListener(onTabActivated)
})
</script>

<template>
  <div class="app">
    <header class="app-head">
      <div class="brand">
        <span class="logo">HB</span>
        <div>
          <div class="title">{{ t('app.title') }}</div>
          <div class="sub">{{ t('app.subtitle') }}</div>
        </div>
      </div>
      <button
        class="btn icon ghost"
        :class="{ 'chip on': activeTab === 'settings' }"
        :title="t('tabs.settings')"
        @click="activeTab = 'settings'"
      >
        ⚙
      </button>
    </header>

    <nav class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ on: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ t(tab.key) }}
      </button>
    </nav>

    <main class="app-body">
      <RequestPanel v-if="activeTab === 'request'" />
      <ToolsPanel v-else-if="activeTab === 'tools'" />
      <SqliPanel v-else-if="activeTab === 'sqli'" />
      <PayloadPanel v-else-if="activeTab === 'payload'" />
      <SettingsPanel v-else />
    </main>

    <footer class="status">
      <span class="dot" :class="runtime.ready ? 'ok' : 'err'"></span>
      <span class="muted" :title="runtime.tabUrl" style="max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
        {{ runtime.tabTitle || runtime.tabUrl || '—' }}
      </span>
      <span class="grow"></span>
      <span
        v-if="lastMessage"
        class="msg"
        :class="lastMessage.level === 'error' ? 'err' : lastMessage.level === 'ok' ? 'ok' : ''"
        :title="lastMessage.text"
        @click="clearMessages"
      >
        {{ lastMessage.text }}
      </span>
      <span v-else class="msg muted">{{ t('app.subtitle') }}</span>
    </footer>
  </div>
</template>
