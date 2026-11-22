<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseTimeInput, timeInfo } from '../../../core/crypto-tools'
import { t, notify } from '../../state'
import { copyText } from '../../../core/util'

const input = ref(String(Math.floor(Date.now() / 1000)))

const info = computed(() => {
  const ms = parseTimeInput(input.value)
  return ms === null ? null : timeInfo(ms)
})

function setNow(): void {
  input.value = String(Math.floor(Date.now() / 1000))
}

async function copy(value: string | number): Promise<void> {
  const ok = await copyText(String(value))
  notify(ok ? t('common.copied') : t('err.copyFailed'), ok ? 'ok' : 'error')
}
</script>

<template>
  <div class="card">
    <div class="card-head">
      <span>{{ t('tools.timestamp') }}</span>
      <div class="head-right">
        <button class="btn small" @click="setNow">{{ t('tools.ts.now') }}</button>
      </div>
    </div>
    <div class="card-body">
      <input v-model="input" type="text" :placeholder="t('tools.ts.input')" class="mono" />
      <template v-if="info">
        <div class="hash-line">
          <span>{{ t('tools.ts.seconds') }}</span>
          <code>{{ info.seconds }}</code>
          <button class="mini" @click="copy(info.seconds)">{{ t('common.copy') }}</button>
        </div>
        <div class="hash-line">
          <span>{{ t('tools.ts.millis') }}</span>
          <code>{{ info.millis }}</code>
          <button class="mini" @click="copy(info.millis)">{{ t('common.copy') }}</button>
        </div>
        <div class="hash-line">
          <span>{{ t('tools.ts.iso') }}</span>
          <code>{{ info.iso }}</code>
          <button class="mini" @click="copy(info.iso)">{{ t('common.copy') }}</button>
        </div>
        <div class="hash-line">
          <span>{{ t('tools.ts.local') }}</span>
          <code>{{ info.local }}</code>
          <button class="mini" @click="copy(info.local)">{{ t('common.copy') }}</button>
        </div>
        <div class="hash-line">
          <span>UTC</span>
          <code>{{ info.utc }}</code>
          <button class="mini" @click="copy(info.utc)">{{ t('common.copy') }}</button>
        </div>
        <div class="hint">{{ info.relative }}</div>
      </template>
      <div v-else class="hint err">{{ t('tools.ts.input') }}</div>
    </div>
  </div>
</template>
