<script setup lang="ts">
import { ref, watch } from 'vue'
import { md5, shaHash, SHA_ALGOS, type ShaAlgo } from '../../../core/hash'
import { t, notify } from '../../state'
import { copyText } from '../../../core/util'

const input = ref('')
const sha = ref<Partial<Record<ShaAlgo, string>>>({})
const md5Value = ref('')
let token = 0

watch(
  input,
  async (value) => {
    token += 1
    const current = token
    md5Value.value = value ? md5(value) : ''
    const next: Partial<Record<ShaAlgo, string>> = {}
    for (const algo of SHA_ALGOS) {
      next[algo] = value ? await shaHash(algo, value) : ''
    }
    if (current === token) sha.value = next
  },
  { immediate: true },
)

async function copy(value: string): Promise<void> {
  if (!value) return
  const ok = await copyText(value)
  notify(ok ? t('common.copied') : t('err.copyFailed'), ok ? 'ok' : 'error')
}
</script>

<template>
  <div class="card">
    <div class="card-head">{{ t('tools.hash') }}</div>
    <div class="card-body">
      <textarea v-model="input" rows="2" :placeholder="t('tools.hash.input')" spellcheck="false"></textarea>
      <div class="hash-line">
        <span>MD5</span>
        <code>{{ md5Value || '—' }}</code>
        <button class="mini" :disabled="!md5Value" @click="copy(md5Value)">{{ t('common.copy') }}</button>
      </div>
      <div v-for="algo in SHA_ALGOS" :key="algo" class="hash-line">
        <span>{{ algo }}</span>
        <code>{{ sha[algo] || '—' }}</code>
        <button class="mini" :disabled="!sha[algo]" @click="copy(sha[algo] || '')">
          {{ t('common.copy') }}
        </button>
      </div>
    </div>
  </div>
</template>
