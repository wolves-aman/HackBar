<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BUILTIN_PAYLOADS } from '../../core/payloads'
import type { CustomPayloadGroup } from '../types'
import { KEYS, storageGet, storageSet } from '../../core/storage'
import { coerceArray } from '../../core/draft'
import { draft, selected, syncUrlFromQuery, t, notify } from '../state'
import { copyText, downloadText, readFileText, uid } from '../../core/util'

interface ViewGroup {
  id: string
  name: string
  items: { id: string; value: string; note?: string }[]
  builtin: boolean
}

const custom = ref<CustomPayloadGroup[]>([])
const groupId = ref('sqli')
const search = ref('')
const newGroupMode = ref(false)
const newGroupName = ref('')
const addItemMode = ref(false)
const newValue = ref('')
const newNote = ref('')
const confirmDelete = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  const saved = await storageGet<unknown>(KEYS.customPayloads, [])
  custom.value = coerceArray<Record<string, unknown>>(saved)
    .filter((group) => group !== null && typeof group === 'object')
    .map((group) => ({
      id: typeof group.id === 'string' && group.id ? group.id : uid('grp'),
      name: String(group.name ?? 'custom'),
      items: coerceArray<Record<string, unknown>>(group.items)
        .filter((item) => item !== null && typeof item === 'object')
        .map((item) => ({
          id: typeof item.id === 'string' && item.id ? item.id : uid('it'),
          value: String(item.value ?? ''),
          note: typeof item.note === 'string' ? item.note : undefined,
        }))
        .filter((item) => item.value !== ''),
    }))
})

watch(
  custom,
  (value) => {
    void storageSet(KEYS.customPayloads, value)
  },
  { deep: true },
)

const groups = computed<ViewGroup[]>(() => [
  ...BUILTIN_PAYLOADS.map((group) => ({
    id: group.id,
    name: t(`group.${group.id}`),
    items: group.items,
    builtin: true,
  })),
  ...custom.value.map((group) => ({
    id: group.id,
    name: group.name,
    items: group.items,
    builtin: false,
  })),
])

const currentGroup = computed(() => groups.value.find((g) => g.id === groupId.value) ?? groups.value[0])

const filtered = computed(() => {
  const items = currentGroup.value?.items ?? []
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return items
  return items.filter(
    (item) =>
      item.value.toLowerCase().includes(keyword) || (item.note ?? '').toLowerCase().includes(keyword),
  )
})

function insertValue(value: string): void {
  const sel = selected.value
  if (sel) {
    const list = sel.kind === 'query' ? draft.query : draft.bodyPairs
    const pair = list.find((p) => p.id === sel.id)
    if (pair) {
      pair.value = value
      if (sel.kind === 'query') syncUrlFromQuery()
      notify(t('payload.inserted'), 'ok')
      return
    }
  }
  void copyText(value).then((ok) => notify(ok ? t('common.copied') : t('err.copyFailed'), ok ? 'ok' : 'error'))
}

function addGroup(): void {
  const name = newGroupName.value.trim()
  if (!name) return
  const group: CustomPayloadGroup = { id: uid('grp'), name, items: [] }
  custom.value.push(group)
  groupId.value = group.id
  newGroupName.value = ''
  newGroupMode.value = false
}

function addItem(): void {
  const value = newValue.value
  if (!value.trim()) return
  const group = custom.value.find((g) => g.id === groupId.value)
  if (!group) return
  group.items.push({ id: uid('it'), value, note: newNote.value.trim() || undefined })
  newValue.value = ''
  newNote.value = ''
  addItemMode.value = false
}

function deleteItem(id: string): void {
  const group = custom.value.find((g) => g.id === groupId.value)
  if (!group) return
  const idx = group.items.findIndex((item) => item.id === id)
  if (idx >= 0) group.items.splice(idx, 1)
}

function deleteGroup(): void {
  if (!confirmDelete.value) {
    confirmDelete.value = true
    setTimeout(() => (confirmDelete.value = false), 2500)
    return
  }
  const idx = custom.value.findIndex((g) => g.id === groupId.value)
  if (idx >= 0) custom.value.splice(idx, 1)
  groupId.value = 'sqli'
  confirmDelete.value = false
}

function exportJson(): void {
  downloadText('hackbar-payloads.json', JSON.stringify(custom.value, null, 2), 'application/json')
}

async function importJson(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await readFileText(file)
    const parsed = JSON.parse(text) as unknown
    if (!Array.isArray(parsed)) throw new Error('not array')
    const cleaned: CustomPayloadGroup[] = []
    for (const raw of parsed) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as Record<string, unknown>
      const name = typeof item.name === 'string' ? item.name : 'imported'
      const items = Array.isArray(item.items) ? item.items : []
      cleaned.push({
        id: uid('grp'),
        name,
        items: items
          .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
          .map((entry) => ({
            id: uid('it'),
            value: String(entry.value ?? ''),
            note: typeof entry.note === 'string' ? entry.note : undefined,
          }))
          .filter((entry) => entry.value !== ''),
      })
    }
    custom.value.push(...cleaned)
    notify(`${t('common.import')} ✓ ${cleaned.length}`, 'ok')
  } catch {
    notify(t('payload.importFailed'), 'error')
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <div class="card">
    <div class="card-head">
      <span>{{ t('tabs.payload') }}</span>
      <div class="head-right">
        <button class="btn small" @click="newGroupMode = !newGroupMode">+ {{ t('payload.addGroup') }}</button>
        <button class="btn small ghost" @click="exportJson">{{ t('common.export') }}</button>
        <button class="btn small ghost" @click="fileInput?.click()">{{ t('common.import') }}</button>
        <input ref="fileInput" type="file" accept=".json,application/json" style="display: none" @change="importJson" />
      </div>
    </div>
    <div class="card-body">
      <input v-model="search" type="text" :placeholder="t('payload.search')" />
      <div class="chip-row">
        <button
          v-for="group in groups"
          :key="group.id"
          class="chip"
          :class="{ on: group.id === groupId }"
          @click="groupId = group.id"
        >
          {{ group.name }}
        </button>
      </div>
      <div v-if="newGroupMode" class="row">
        <input v-model="newGroupName" type="text" :placeholder="t('payload.groupName')" @keyup.enter="addGroup" />
        <button class="btn small" @click="addGroup">{{ t('common.save') }}</button>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <span>{{ currentGroup?.name }}</span>
      <span class="tag">{{ filtered.length }}</span>
      <div v-if="currentGroup && !currentGroup.builtin" class="head-right">
        <button class="btn small" @click="addItemMode = !addItemMode">+</button>
        <button class="btn small danger" @click="deleteGroup">
          {{ confirmDelete ? '确认？' : t('payload.deleteGroup') }}
        </button>
      </div>
    </div>
    <div v-if="addItemMode" class="card-body">
      <input v-model="newValue" type="text" :placeholder="t('payload.itemValue')" />
      <input v-model="newNote" type="text" :placeholder="t('payload.note')" />
      <button class="btn small primary" @click="addItem">{{ t('common.save') }}</button>
    </div>
    <div class="list">
      <div v-for="item in filtered" :key="item.id" class="list-item" @click="insertValue(item.value)">
        <span class="val" :title="item.value">{{ item.value }}</span>
        <span v-if="item.note" class="tag">{{ item.note }}</span>
        <span v-if="currentGroup && !currentGroup.builtin" class="act">
          <button class="mini" @click.stop="deleteItem(item.id)">×</button>
        </span>
      </div>
      <div v-if="!filtered.length" class="empty">{{ t('payload.empty') }}</div>
    </div>
    <div class="hint" style="padding: 6px 9px">{{ t('payload.insertHint') }}</div>
  </div>
</template>
