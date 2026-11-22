<script setup lang="ts">
import { computed, ref } from 'vue'
import { generateRandom, type RandomOptions } from '../../../core/random'
import { t, notify } from '../../state'
import { copyText } from '../../../core/util'

const kind = ref<RandomOptions['kind']>('string')
const length = ref(16)
const min = ref(1)
const max = ref(100)
const output = ref('')

const needsLength = computed(() => ['string', 'password', 'hex'].includes(kind.value))
const needsRange = computed(() => kind.value === 'number')

function generate(): void {
  output.value = generateRandom({
    kind: kind.value,
    length: Math.max(1, Number(length.value) || 1),
    min: Number(min.value) || 0,
    max: Number(max.value) || 0,
  })
}

async function copy(): Promise<void> {
  if (!output.value) return
  const ok = await copyText(output.value)
  notify(ok ? t('common.copied') : t('err.copyFailed'), ok ? 'ok' : 'error')
}

generate()
</script>

<template>
  <div class="card">
    <div class="card-head">
      <span>{{ t('tools.random') }}</span>
      <div class="head-right">
        <select v-model="kind" style="width: 122px" @change="generate">
          <option value="string">{{ t('rand.string') }}</option>
          <option value="number">{{ t('rand.number') }}</option>
          <option value="uuid">{{ t('rand.uuid') }}</option>
          <option value="ipv4">{{ t('rand.ipv4') }}</option>
          <option value="ipv6">{{ t('rand.ipv6') }}</option>
          <option value="port">{{ t('rand.port') }}</option>
          <option value="password">{{ t('rand.password') }}</option>
          <option value="hex">{{ t('rand.hex') }}</option>
        </select>
      </div>
    </div>
    <div class="card-body">
      <div v-if="needsLength" class="row">
        <span class="label">{{ t('tools.random.count') }}</span>
        <input v-model.number="length" type="number" min="1" max="4096" style="width: 90px" />
      </div>
      <div v-if="needsRange" class="row">
        <span class="label">{{ t('tools.random.min') }}</span>
        <input v-model.number="min" type="number" class="grow" />
        <span class="label">{{ t('tools.random.max') }}</span>
        <input v-model.number="max" type="number" class="grow" />
      </div>
      <div class="row">
        <button class="btn small primary" @click="generate">{{ t('tools.generate') }}</button>
        <span class="grow"></span>
        <button class="btn small ghost" :disabled="!output" @click="copy">{{ t('common.copy') }}</button>
      </div>
      <input :value="output" type="text" readonly class="mono" />
    </div>
  </div>
</template>
