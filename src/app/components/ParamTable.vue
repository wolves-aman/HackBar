<script setup lang="ts">
import type { Pair } from '../../core/url'

const props = defineProps<{
  pairs: Pair[]
  kind: 'query' | 'body' | 'headers'
  selectedId?: string | null
  keyPlaceholder?: string
  valuePlaceholder?: string
}>()

const emit = defineEmits<{
  (e: 'change'): void
  (e: 'remove', id: string): void
  (e: 'select', id: string): void
}>()

function changed(): void {
  emit('change')
}

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= props.pairs.length) return
  const item = props.pairs.splice(index, 1)[0]
  if (!item) return
  props.pairs.splice(target, 0, item)
  emit('change')
}
</script>

<template>
  <div class="pairs">
    <div
      v-for="(pair, index) in pairs"
      :key="pair.id"
      class="pair"
      :class="{ disabled: !pair.enabled, active: selectedId === pair.id }"
    >
      <input v-model="pair.enabled" type="checkbox" @change="changed" />
      <input
        v-model="pair.key"
        type="text"
        :placeholder="keyPlaceholder || 'key'"
        @input="changed"
        @focus="emit('select', pair.id)"
      />
      <input
        v-model="pair.value"
        type="text"
        :placeholder="valuePlaceholder || 'value'"
        @input="changed"
        @focus="emit('select', pair.id)"
      />
      <div class="pair-actions">
        <button class="mini" title="上移" @click="move(index, -1)">↑</button>
        <button class="mini" title="下移" @click="move(index, 1)">↓</button>
        <button class="mini" :title="$props.kind === 'headers' ? '删除' : '删除'" @click="emit('remove', pair.id)">
          ×
        </button>
      </div>
    </div>
    <div v-if="pairs.length === 0" class="empty">—</div>
  </div>
</template>
