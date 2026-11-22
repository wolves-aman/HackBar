<script setup lang="ts">
import { settings, t, lang } from '../state'

const version =
  typeof chrome !== 'undefined' && chrome.runtime?.getManifest
    ? chrome.runtime.getManifest().version
    : 'dev'
</script>

<template>
  <div class="card">
    <div class="card-head">{{ t('settings.title') }}</div>
    <div class="card-body">
      <div class="field">
        <span class="label">{{ t('settings.language') }}</span>
        <select v-model="settings.lang">
          <option value="auto">{{ t('settings.language.auto') }}</option>
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>
      <div class="field">
        <span class="label">{{ t('settings.theme') }}</span>
        <select v-model="settings.theme">
          <option value="auto">{{ t('settings.theme.auto') }}</option>
          <option value="dark">{{ t('settings.theme.dark') }}</option>
          <option value="light">{{ t('settings.theme.light') }}</option>
        </select>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">{{ t('settings.permissions') }}</div>
    <div class="card-body">
      <div class="hint">· {{ t('settings.permAllUrls') }}</div>
      <div class="hint">· {{ t('settings.permDnr') }}</div>
      <div class="hint">· {{ t('settings.permCookies') }}</div>
      <div class="hint">· {{ t('settings.permStorage') }}</div>
      <div class="hint">{{ t('settings.storageNote') }}</div>
    </div>
  </div>

  <div class="disclaimer">{{ t('settings.disclaimer') }}</div>

  <div class="card">
    <div class="card-head">{{ t('settings.about') }}</div>
    <div class="card-body">
      <div class="field">
        <span class="label">{{ t('settings.version') }}</span>
        <span class="mono">v{{ version }}</span>
      </div>
      <div class="field">
        <span class="label">UI</span>
        <span class="mono">Vue 3 · MV3</span>
      </div>
      <div class="field">
        <span class="label">{{ t('settings.language') }}</span>
        <span class="mono">{{ lang }}</span>
      </div>
    </div>
  </div>
</template>
