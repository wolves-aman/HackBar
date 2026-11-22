<script setup lang="ts">
import { computed, ref } from 'vue'
import { buildSqli, SQLI_ITEMS, spaceToComment, wrapSqli, type Dbms, type SqliContext } from '../../core/sqli'
import { draft, selected, syncUrlFromQuery, t, notify } from '../state'
import { copyText } from '../../core/util'

const dbms = ref<Dbms>('mysql')
const item = ref('dumpDatabases')
const columns = ref(3)
const table = ref('users')
const quote = ref(true)
const comment = ref(true)
const bypass = ref(false)

const items = computed(() => SQLI_ITEMS[dbms.value])

const ctx = computed<SqliContext>(() => ({
  columns: columns.value,
  table: table.value,
  quote: quote.value,
  comment: comment.value,
}))

const generated = computed(() => {
  const found = items.value.find((i) => i.id === item.value)
  if (!found) return ''
  const raw = buildSqli(dbms.value, item.value, ctx.value)
  const wrapped = wrapSqli(raw, found.needsQuote, ctx.value)
  return bypass.value ? spaceToComment(wrapped) : wrapped
})

function onDbmsChange(): void {
  if (!items.value.some((i) => i.id === item.value)) {
    item.value = items.value[0]?.id ?? 'version'
  }
}

function insert(): void {
  if (!generated.value) return
  const sel = selected.value
  if (!sel) {
    notify(t('sqli.needRow'), 'error')
    return
  }
  const list = sel.kind === 'query' ? draft.query : draft.bodyPairs
  const pair = list.find((p) => p.id === sel.id)
  if (!pair) {
    notify(t('sqli.needRow'), 'error')
    return
  }
  pair.value = generated.value
  if (sel.kind === 'query') syncUrlFromQuery()
  notify(t('sqli.insertTo') + ' ✓', 'ok')
}

async function copy(): Promise<void> {
  const ok = await copyText(generated.value)
  notify(ok ? t('sqli.copied') : t('err.copyFailed'), ok ? 'ok' : 'error')
}
</script>

<template>
  <div class="card">
    <div class="card-head">{{ t('sqli.title') }}</div>
    <div class="card-body">
      <div class="row">
        <span class="label">{{ t('sqli.dbms') }}</span>
        <select v-model="dbms" style="width: 118px" @change="onDbmsChange">
          <option value="mysql">MySQL</option>
          <option value="postgres">PostgreSQL</option>
          <option value="mssql">MSSQL</option>
          <option value="sqlite">SQLite</option>
        </select>
        <span class="label">{{ t('sqli.columns') }}</span>
        <input v-model.number="columns" type="number" min="1" max="50" style="width: 54px" />
      </div>
      <div class="row">
        <span class="label">{{ t('sqli.table') }}</span>
        <input v-model="table" type="text" class="grow" />
      </div>
      <div class="row wrap">
        <label class="label" style="display: flex; gap: 4px; align-items: center">
          <input v-model="quote" type="checkbox" /> {{ t('sqli.quote') }}
        </label>
        <label class="label" style="display: flex; gap: 4px; align-items: center">
          <input v-model="comment" type="checkbox" /> {{ t('sqli.comment') }}
        </label>
        <label class="label" style="display: flex; gap: 4px; align-items: center">
          <input v-model="bypass" type="checkbox" /> {{ t('sqli.spaceBypass') }}
        </label>
      </div>
      <div class="chip-row">
        <button
          v-for="option in items"
          :key="option.id"
          class="chip"
          :class="{ on: item === option.id }"
          @click="item = option.id"
        >
          {{ t(`sqli.${option.id}`) }}
        </button>
      </div>
      <textarea :value="generated" rows="5" readonly class="mono"></textarea>
      <div class="row">
        <button class="btn small primary" @click="insert">{{ t('sqli.insertTo') }}</button>
        <button class="btn small" @click="copy">{{ t('common.copy') }}</button>
      </div>
      <div class="hint">{{ t('sqli.hint') }}</div>
    </div>
  </div>
</template>
