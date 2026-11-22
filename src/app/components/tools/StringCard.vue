<script setup lang="ts">
import { computed, ref } from 'vue'
import { STRING_OPS } from '../../../core/string-ops'
import { t, notify } from '../../state'
import { copyText } from '../../../core/util'

const text = ref('')
const opId = ref('upper')
const arg = ref('')

const currentOp = computed(() => STRING_OPS.find((op) => op.id === opId.value) ?? STRING_OPS[0])

const output = computed(() => {
  const op = currentOp.value
  if (!op) return ''
  try {
    return op.run(text.value, arg.value)
  } catch {
    return ''
  }
})

async function copy(): Promise<void> {
  const ok = await copyText(output.value)
  notify(ok ? t('common.copied') : t('err.copyFailed'), ok ? 'ok' : 'error')
}
</script>

<template>
  <div class="card">
    <div class="card-head">
      <span>{{ t('tools.string') }}</span>
      <div class="head-right">
        <select v-model="opId" style="width: 138px">
          <option v-for="op in STRING_OPS" :key="op.id" :value="op.id">{{ t(`op.${op.id}`) }}</option>
        </select>
      </div>
    </div>
    <div class="card-body">
      <div v-if="currentOp?.arg" class="row">
        <span class="label">{{ t('tools.string.arg') }}</span>
        <input v-model="arg" class="grow" type="text" placeholder="prefix / suffix" />
      </div>
      <textarea v-model="text" rows="3" :placeholder="t('tools.input')" spellcheck="false"></textarea>
      <div class="row">
        <button class="btn small ghost" :disabled="!output" @click="text = output">
          {{ t('tools.swap') }}
        </button>
        <span class="grow"></span>
        <button class="btn small ghost" :disabled="!output" @click="copy">{{ t('common.copy') }}</button>
      </div>
      <textarea :value="output" rows="3" readonly :placeholder="t('tools.output')" spellcheck="false"></textarea>
    </div>
  </div>
</template>
