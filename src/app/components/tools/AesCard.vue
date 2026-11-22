<script setup lang="ts">
import { ref } from 'vue'
import { aesDecrypt, aesEncrypt, type AesMode, type DataFormat, type KeyFormat } from '../../../core/crypto-tools'
import { t, notify } from '../../state'
import { copyText } from '../../../core/util'

const input = ref('')
const output = ref('')
const error = ref('')
const busy = ref(false)
const key = ref('')
const keyFormat = ref<KeyFormat>('utf8')
const iv = ref('')
const ivFormat = ref<KeyFormat>('hex')
const mode = ref<AesMode>('CBC')
const format = ref<DataFormat>('base64')

function newIv(): void {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  iv.value = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  ivFormat.value = 'hex'
}

async function run(kind: 'encrypt' | 'decrypt'): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const options = {
      key: key.value,
      keyFormat: keyFormat.value,
      iv: iv.value,
      ivFormat: ivFormat.value,
      mode: mode.value,
      output: format.value,
    }
    output.value = kind === 'encrypt' ? await aesEncrypt(input.value, options) : await aesDecrypt(input.value, options)
    if (kind === 'encrypt' && !iv.value) newIv()
  } catch (err) {
    output.value = ''
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function copy(): Promise<void> {
  const ok = await copyText(output.value)
  notify(ok ? t('common.copied') : t('err.copyFailed'), ok ? 'ok' : 'error')
}
</script>

<template>
  <div class="card">
    <div class="card-head">{{ t('tools.aes') }}</div>
    <div class="card-body">
      <div class="row">
        <span class="label">{{ t('tools.aes.mode') }}</span>
        <select v-model="mode" style="width: 74px">
          <option value="CBC">CBC</option>
          <option value="GCM">GCM</option>
        </select>
        <span class="label">{{ t('tools.aes.output') }}</span>
        <select v-model="format" style="width: 84px">
          <option value="base64">base64</option>
          <option value="hex">hex</option>
        </select>
      </div>
      <div class="row">
        <span class="label">{{ t('tools.aes.key') }}</span>
        <input v-model="key" type="text" class="grow" placeholder="16 / 24 / 32 bytes" />
        <select v-model="keyFormat" style="width: 64px">
          <option value="utf8">utf8</option>
          <option value="hex">hex</option>
        </select>
      </div>
      <div class="row">
        <span class="label">{{ t('tools.aes.iv') }}</span>
        <input v-model="iv" type="text" class="grow" placeholder="16 bytes" />
        <select v-model="ivFormat" style="width: 64px">
          <option value="hex">hex</option>
          <option value="utf8">utf8</option>
        </select>
        <button class="btn small" @click="newIv">{{ t('tools.aes.newIv') }}</button>
      </div>
      <textarea v-model="input" rows="3" :placeholder="t('tools.input')" spellcheck="false"></textarea>
      <div class="row">
        <button class="btn small primary" :disabled="busy" @click="run('encrypt')">
          {{ t('tools.aes.encrypt') }}
        </button>
        <button class="btn small" :disabled="busy" @click="run('decrypt')">
          {{ t('tools.aes.decrypt') }}
        </button>
        <span class="grow"></span>
        <button class="btn small ghost" :disabled="!output" @click="copy">{{ t('common.copy') }}</button>
      </div>
      <textarea :value="output" rows="3" readonly :placeholder="t('tools.output')" spellcheck="false"></textarea>
      <div v-if="error" class="err">{{ error }}</div>
      <div class="hint">{{ t('tools.aes.note') }}</div>
    </div>
  </div>
</template>
