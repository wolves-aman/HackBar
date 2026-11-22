<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { CODECS, getCodec } from '../../../core/encode'
import { t, notify } from '../../state'
import { copyText } from '../../../core/util'

const codecId = ref('url')
const input = ref('')
const output = ref('')
const error = ref('')

const current = computed(() => getCodec(codecId.value))

function run(direction: 'encode' | 'decode'): void {
  try {
    output.value = current.value[direction](input.value)
    error.value = ''
  } catch (err) {
    output.value = ''
    error.value = err instanceof Error ? err.message : String(err)
  }
}

watch(codecId, () => {
  if (input.value) run('encode')
})

async function copy(): Promise<void> {
  const ok = await copyText(output.value)
  notify(ok ? t('common.copied') : t('err.copyFailed'), ok ? 'ok' : 'error')
}
</script>

<template>
  <div class="card">
    <div class="card-head">
      <span>{{ t('tools.codec') }}</span>
      <div class="head-right">
        <select v-model="codecId" style="width: 150px">
          <option v-for="codec in CODECS" :key="codec.id" :value="codec.id">
            {{ t(`codec.${codec.id}`) }}
          </option>
        </select>
      </div>
    </div>
    <div class="card-body">
      <textarea v-model="input" rows="3" :placeholder="t('tools.input')" spellcheck="false"></textarea>
      <div class="row">
        <button class="btn small" @click="run('encode')">{{ t('tools.encode') }}</button>
        <button class="btn small" @click="run('decode')">{{ t('tools.decode') }}</button>
        <button class="btn small ghost" :disabled="!output" @click="input = output">
          {{ t('tools.swap') }}
        </button>
        <span class="grow"></span>
        <button class="btn small ghost" :disabled="!output" @click="copy">{{ t('common.copy') }}</button>
      </div>
      <textarea :value="output" rows="3" readonly :placeholder="t('tools.output')" spellcheck="false"></textarea>
      <div v-if="error" class="err">{{ error }}</div>
      <div v-if="current.hint === 'gbkHint'" class="hint">{{ t('tools.gbkHint') }}</div>
    </div>
  </div>
</template>
