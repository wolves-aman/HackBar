<script setup lang="ts">
import { computed, ref } from 'vue'
import { decodeJwt } from '../../../core/crypto-tools'
import { t } from '../../state'

const token = ref('')

const decoded = computed(() => (token.value.trim() ? decodeJwt(token.value) : null))

const expText = computed(() => {
  const payload = decoded.value?.payload as Record<string, unknown> | null
  const exp = typeof payload?.exp === 'number' ? payload.exp : null
  if (!exp) return ''
  const diff = exp * 1000 - Date.now()
  if (diff <= 0) return t('tools.jwt.expired')
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  return t('tools.jwt.expiresIn', { t: `${hours}h ${minutes}m` })
})

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
</script>

<template>
  <div class="card">
    <div class="card-head">
      <span>{{ t('tools.jwt') }}</span>
      <span v-if="expText" class="tag">{{ expText }}</span>
    </div>
    <div class="card-body">
      <textarea v-model="token" rows="3" :placeholder="t('tools.jwt.input')" spellcheck="false"></textarea>
      <template v-if="decoded">
        <div v-if="decoded.ok">
          <div class="label">{{ t('tools.jwt.header') }}</div>
          <pre class="preview">{{ pretty(decoded.header) }}</pre>
          <div class="label">{{ t('tools.jwt.payload') }}</div>
          <pre class="preview">{{ pretty(decoded.payload) }}</pre>
          <div class="label">{{ t('tools.jwt.signature') }}</div>
          <pre class="preview">{{ decoded.signature || '—' }}</pre>
        </div>
        <div v-else class="err">{{ t('tools.jwt.invalid') }}：{{ decoded.error }}</div>
      </template>
    </div>
  </div>
</template>
