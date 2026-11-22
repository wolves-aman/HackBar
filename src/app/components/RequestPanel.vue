<script setup lang="ts">
import { computed, ref } from 'vue'
import ParamTable from './ParamTable.vue'
import { METHODS } from '../types'
import type { BodyMode } from '../types'
import {
  draft,
  settings,
  runtime,
  selected,
  t,
  notify,
  onUrlInput,
  syncUrlFromQuery,
  addQueryPair,
  addBodyPair,
  removePair,
  setBodyMode,
  loadFromTab,
  reloadCookies,
  send,
} from '../state'
import { makePair, pairsFromUrl, parsePairs, stringifyPairs } from '../../core/url'
import { SKIP_HEADERS } from '../send'
import { parsePastedRequest } from '../../core/curl'
import { copyText, uid } from '../../core/util'

const pasteOpen = ref(false)
const pasteText = ref('')
const pasteError = ref('')
const templateNameMode = ref(false)
const templateName = ref('')

const headersPreview = computed(() => {
  const seen = new Set<string>()
  const rows: { name: string; value: string; skipped: boolean }[] = []
  for (const h of draft.headers) {
    if (!h.enabled || !h.key.trim()) continue
    const lower = h.key.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    rows.push({
      name: h.key,
      value: h.value,
      skipped: SKIP_HEADERS.has(lower) || lower === 'cookie',
    })
  }
  return rows
})

const injectRows = computed(() => headersPreview.value.filter((h) => !h.skipped))
const skippedRows = computed(() => headersPreview.value.filter((h) => h.skipped))
const cookieEdits = computed(() => draft.cookies.filter((c) => c.enabled && c.name.trim()).length)
const finalUrl = computed(() => draft.url || '—')

function onSend(): void {
  void send()
}

function handleUrl(event: Event): void {
  onUrlInput((event.target as HTMLInputElement).value)
}

function clearAll(): void {
  draft.method = 'GET'
  draft.url = ''
  draft.query = []
  draft.bodyMode = 'none'
  draft.bodyPairs = []
  draft.rawBody = ''
  draft.headers = [makePair('User-Agent', navigator.userAgent)]
  draft.cookies = []
  notify(t('url.clean'), 'info')
}

async function copyUrl(): Promise<void> {
  const ok = await copyText(draft.url)
  notify(ok ? t('common.copied') : t('err.copyFailed'), ok ? 'ok' : 'error')
}

function openPaste(): void {
  pasteText.value = ''
  pasteError.value = ''
  pasteOpen.value = true
}

function applyPaste(): void {
  const parsed = parsePastedRequest(pasteText.value)
  if (!parsed) {
    pasteError.value = t('raw.parseFailed')
    return
  }
  draft.method = parsed.method
  draft.url = parsed.url
  draft.query = pairsFromUrl(parsed.url)

  // Cookie 头单独拆出来（DNR 改不了 Cookie，走 cookies API）
  const cookieHeader = parsed.headers.find((h) => h.name.toLowerCase() === 'cookie')
  if (cookieHeader) {
    const rows = cookieHeader.value
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eq = part.indexOf('=')
        return {
          id: uid('ck'),
          name: eq >= 0 ? part.slice(0, eq) : part,
          value: eq >= 0 ? part.slice(eq + 1) : '',
          enabled: true,
          path: '/',
        }
      })
    draft.cookies = rows
  }

  draft.headers = parsed.headers
    .filter((h) => h.name.toLowerCase() !== 'cookie')
    .map((h) => makePair(h.name, h.value))

  const contentType =
    parsed.headers.find((h) => h.name.toLowerCase() === 'content-type')?.value.toLowerCase() ?? ''

  if (!parsed.body) {
    draft.bodyMode = 'none'
    draft.rawBody = ''
    draft.bodyPairs = []
  } else if (contentType.includes('json')) {
    draft.bodyMode = 'json'
    draft.rawBody = parsed.body
    draft.bodyPairs = []
  } else if (contentType.includes('x-www-form-urlencoded')) {
    draft.bodyMode = 'urlencoded'
    draft.bodyPairs = parsePairs(parsed.body)
    draft.rawBody = parsed.body
  } else if (contentType.includes('multipart')) {
    draft.bodyMode = 'multipart'
    draft.bodyPairs = []
    draft.rawBody = parsed.body
  } else {
    draft.bodyMode = 'raw'
    draft.rawBody = parsed.body
    draft.bodyPairs = []
  }

  pasteOpen.value = false
  const messages = [t('raw.parse') + ' ✓']
  if (parsed.warnings.length) messages.push(parsed.warnings.join(' / '))
  if (contentType.includes('multipart')) messages.push(t('body.multipartHint'))
  notify(messages.join(' · '), 'ok')
}

function onBodyModeChange(event: Event): void {
  const mode = (event.target as HTMLSelectElement).value as BodyMode
  setBodyMode(mode)
  if ((mode === 'urlencoded' || mode === 'multipart') && draft.bodyPairs.length === 0 && draft.rawBody.trim()) {
    if (mode === 'urlencoded') draft.bodyPairs = parsePairs(draft.rawBody)
  }
}

function selectPair(kind: 'query' | 'body', id: string): void {
  selected.value = { kind, id }
}

function removeQuery(id: string): void {
  removePair('query', id)
}

function removeBody(id: string): void {
  removePair('body', id)
}

function removeHeader(id: string): void {
  const idx = draft.headers.findIndex((h) => h.id === id)
  if (idx >= 0) draft.headers.splice(idx, 1)
}

function removeCookie(id: string): void {
  const idx = draft.cookies.findIndex((c) => c.id === id)
  if (idx >= 0) draft.cookies.splice(idx, 1)
}

function addCookie(): void {
  draft.cookies.push({ id: uid('ck'), name: '', value: '', enabled: true, path: '/' })
}

function applyTemplate(): void {
  const select = document.getElementById('template-select') as HTMLSelectElement | null
  const id = select?.value ?? ''
  const tpl = settings.templates.find((item) => item.id === id)
  if (!tpl) return
  draft.headers = tpl.headers.map((h) => makePair(h.name, h.value))
  notify(`${t('common.apply')} · ${tpl.name}`, 'ok')
}

function saveTemplate(): void {
  const name = templateName.value.trim()
  if (!name) return
  settings.templates.push({
    id: uid('tpl'),
    name,
    headers: draft.headers
      .filter((h) => h.enabled && h.key.trim())
      .map((h) => ({ name: h.key, value: h.value })),
  })
  templateName.value = ''
  templateNameMode.value = false
  notify(t('common.save') + ' ✓', 'ok')
}

function deleteTemplate(): void {
  const select = document.getElementById('template-select') as HTMLSelectElement | null
  const id = select?.value ?? ''
  const idx = settings.templates.findIndex((item) => item.id === id)
  if (idx >= 0) settings.templates.splice(idx, 1)
}

function bodyString(): string {
  return stringifyPairs(draft.bodyPairs, true)
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <div class="row">
        <select v-model="draft.method" style="width: 84px; flex: 0 0 84px">
          <option v-for="m in METHODS" :key="m" :value="m">{{ m }}</option>
        </select>
        <input
          class="grow"
          type="text"
          :value="draft.url"
          :placeholder="t('url.placeholder')"
          spellcheck="false"
          @input="handleUrl"
        />
        <button class="btn primary" :disabled="runtime.sending" @click="onSend">
          {{ runtime.sending ? t('send.sending') : t('url.send') }}
        </button>
      </div>

      <div class="row wrap">
        <button class="btn small" @click="loadFromTab">{{ t('url.loadFromTab') }}</button>
        <button class="btn small" @click="openPaste">{{ t('url.pasteRequest') }}</button>
        <button class="btn small ghost" @click="copyUrl">{{ t('common.copy') }}</button>
        <button class="btn small ghost" @click="clearAll">{{ t('url.clean') }}</button>
        <span class="grow"></span>
        <span class="label">{{ t('url.target') }}</span>
        <button
          class="chip"
          :class="{ on: draft.target === 'current' }"
          @click="draft.target = 'current'"
        >
          {{ t('url.target.current') }}
        </button>
        <button class="chip" :class="{ on: draft.target === 'new' }" @click="draft.target = 'new'">
          {{ t('url.target.new') }}
        </button>
      </div>

      <details>
        <summary class="summary">
          {{ t('preview.title') }}
          <span class="tag">{{ injectRows.length }} {{ t('preview.headers') }}</span>
          <span v-if="cookieEdits" class="tag">{{ cookieEdits }}</span>
        </summary>
        <div class="preview">
          <div><b>{{ t('preview.url') }}</b> {{ finalUrl }}</div>
          <div>
            <b>{{ t('preview.headers') }}</b>
            <span v-if="!injectRows.length"> {{ t('preview.none') }}</span>
          </div>
          <div v-for="h in injectRows" :key="h.name">　{{ h.name }}: {{ h.value }}</div>
          <div v-if="skippedRows.length" class="warn">
            <b>{{ t('preview.skipped') }}</b>
            {{ skippedRows.map((h) => h.name).join(', ') }}
          </div>
          <div>
            <b>{{ t('preview.cookies') }}</b>
            <span v-if="!cookieEdits"> {{ t('preview.none') }}</span>
            <span v-else> {{ cookieEdits }}</span>
          </div>
          <div class="hint">{{ t('preview.hint') }}</div>
        </div>
      </details>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <span>{{ t('query.title') }}</span>
      <div class="head-right">
        <label class="label" style="display: flex; align-items: center; gap: 4px">
          <input v-model="draft.autoEncode" type="checkbox" @change="syncUrlFromQuery" />
          {{ t('query.autoEncode') }}
        </label>
        <button class="btn small" @click="addQueryPair">+</button>
      </div>
    </div>
    <div class="card-body flush">
      <ParamTable
        :pairs="draft.query"
        kind="query"
        :selected-id="selected?.kind === 'query' ? selected.id : null"
        @change="syncUrlFromQuery"
        @remove="removeQuery"
        @select="selectPair('query', $event)"
      />
      <div v-if="!draft.query.length" class="empty">{{ t('query.empty') }}</div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <span>{{ t('body.title') }}</span>
      <div class="head-right">
        <select :value="draft.bodyMode" style="width: 132px" @change="onBodyModeChange">
          <option value="none">{{ t('body.none') }}</option>
          <option value="urlencoded">{{ t('body.urlencoded') }}</option>
          <option value="multipart">{{ t('body.multipart') }}</option>
          <option value="json">{{ t('body.json') }}</option>
          <option value="raw">{{ t('body.raw') }}</option>
        </select>
        <button
          v-if="draft.bodyMode === 'urlencoded' || draft.bodyMode === 'multipart'"
          class="btn small"
          @click="addBodyPair"
        >
          +
        </button>
      </div>
    </div>
    <div v-if="draft.bodyMode !== 'none'" class="card-body flush">
      <ParamTable
        v-if="draft.bodyMode === 'urlencoded' || draft.bodyMode === 'multipart'"
        :pairs="draft.bodyPairs"
        kind="body"
        :selected-id="selected?.kind === 'body' ? selected.id : null"
        @change="() => undefined"
        @remove="removeBody"
        @select="selectPair('body', $event)"
      />
      <div v-else class="card-body">
        <textarea
          v-model="draft.rawBody"
          rows="6"
          :placeholder="draft.bodyMode === 'json' ? '{ &quot;a&quot;: 1 }' : t('body.rawPlaceholder')"
        ></textarea>
      </div>
      <div v-if="draft.bodyMode === 'multipart'" class="hint" style="padding: 0 9px 8px">
        {{ t('body.multipartHint') }}
      </div>
      <div v-if="draft.bodyMode === 'json'" class="hint warn" style="padding: 0 9px 8px">
        {{ t('body.jsonHint') }}
      </div>
      <div v-if="draft.bodyMode === 'urlencoded'" class="hint" style="padding: 0 9px 8px">
        {{ bodyString() || '—' }}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <span>{{ t('headers.title') }}</span>
      <div class="head-right">
        <select id="template-select" style="width: 92px" @change="applyTemplate">
          <option value="">{{ t('headers.template') }}</option>
          <option v-for="tpl in settings.templates" :key="tpl.id" :value="tpl.id">{{ tpl.name }}</option>
        </select>
        <button class="btn small" @click="templateNameMode = !templateNameMode">+</button>
        <button class="btn small ghost" @click="deleteTemplate">−</button>
      </div>
    </div>
    <div class="card-body flush">
      <div v-if="templateNameMode" class="row" style="padding: 6px 9px">
        <input v-model="templateName" type="text" :placeholder="t('headers.templateName')" @keyup.enter="saveTemplate" />
        <button class="btn small" @click="saveTemplate">{{ t('common.save') }}</button>
      </div>
      <ParamTable
        :pairs="draft.headers"
        kind="headers"
        key-placeholder="Header"
        value-placeholder="value"
        :selected-id="null"
        @change="() => undefined"
        @remove="removeHeader"
        @select="() => undefined"
      />
      <div class="row" style="padding: 6px 9px">
        <button class="btn small" @click="draft.headers.push(makePair('', ''))">
          + {{ t('headers.add') }}
        </button>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <span>{{ t('cookies.title') }} <span class="tag">{{ draft.cookies.length }}</span></span>
      <div class="head-right">
        <button class="btn small" @click="reloadCookies">{{ t('cookies.reload') }}</button>
        <button class="btn small" @click="addCookie">+</button>
      </div>
    </div>
    <div class="card-body flush">
      <div
        v-for="c in draft.cookies"
        :key="c.id"
        class="pair"
        style="grid-template-columns: 16px minmax(0, 0.85fr) minmax(0, 1.2fr) auto"
      >
        <input v-model="c.enabled" type="checkbox" />
        <input v-model="c.name" type="text" placeholder="name" :title="c.domain || ''" />
        <input v-model="c.value" type="text" placeholder="value" />
        <div class="pair-actions" style="opacity: 1">
          <button class="mini" @click="removeCookie(c.id)">×</button>
        </div>
      </div>
      <div v-if="!draft.cookies.length" class="empty">{{ t('cookies.empty') }}</div>
      <div class="hint" style="padding: 0 9px 8px">{{ t('cookies.hint') }}</div>
    </div>
  </div>

  <div v-if="pasteOpen" class="modal-mask" @click.self="pasteOpen = false">
    <div class="modal">
      <div class="card-head">
        <span>{{ t('raw.title') }}</span>
        <button class="mini" @click="pasteOpen = false">×</button>
      </div>
      <div class="card-body">
        <textarea v-model="pasteText" rows="10" :placeholder="t('raw.placeholder')"></textarea>
        <div v-if="pasteError" class="err">{{ pasteError }}</div>
        <div class="row">
          <button class="btn primary grow" @click="applyPaste">{{ t('raw.parse') }}</button>
          <button class="btn ghost" @click="pasteOpen = false">{{ t('common.cancel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
