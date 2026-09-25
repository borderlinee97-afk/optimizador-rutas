<template>
  <div class="panel" :class="{ collapsed }">
    <div class="panel-header">
      <div class="panel-title-wrap">
        <div class="panel-eyebrow">Planeación operativa</div>
        <h4>Resultados de operación</h4>
      </div>

      <button class="btn-mini" @click="$emit('toggle-collapsed')">
        {{ collapsed ? 'Expandir' : 'Contraer' }}
      </button>
    </div>

    <div class="panel-body" v-if="!collapsed">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  collapsed: { type: Boolean, required: true }
})

defineEmits(['toggle-collapsed'])
</script>

<style scoped>
.panel {
  position: absolute;
  right: 20px;
  bottom: 20px;
  z-index: 9998;
  background: #ffffff;
  border: 1px solid #dbe2ea;
  border-radius: 14px;
  width: clamp(360px, 30vw, 460px);
  max-width: calc(100vw - 40px);
  max-height: min(68vh, calc(100vh - 120px));
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
  font: 12.5px/1.38 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  overflow: hidden;
  backdrop-filter: blur(4px);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #e8edf3;
  background: linear-gradient(180deg, #ffffff 0%, #fafbfd 100%);
}

.panel-title-wrap {
  min-width: 0;
}

.panel-eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6b7280;
  margin-bottom: 2px;
}

.panel-header h4 {
  margin: 0;
  color: #111827;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}

.panel-body {
  max-height: calc(min(68vh, 100vh - 120px) - 58px);
  overflow: auto;
  padding: 10px 12px 12px;
  background: #fcfcfd;
  scrollbar-width: thin;
}

.panel-body::-webkit-scrollbar {
  width: 9px;
}

.panel-body::-webkit-scrollbar-track {
  background: transparent;
}

.panel-body::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.panel.collapsed .panel-body {
  display: none;
}

.btn-mini {
  appearance: none;
  background: #ffffff;
  color: #111827;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 9px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

.btn-mini:hover {
  background: #f9fafb;
  border-color: #c5ced8;
  transform: translateY(-1px);
}

.btn-mini:active {
  transform: translateY(0);
}

/* Compactación suave del contenido dentro del slot */
.panel-body :deep(.route-cart),
.panel-body :deep(.panel-general) {
  font-size: 0.98em;
}

.panel-body :deep(.route-cart),
.panel-body :deep(.panel-general),
.panel-body :deep(.module-block),
.panel-body :deep(.resume-block),
.panel-body :deep(.panel-section) {
  margin-bottom: 10px;
}

.panel-body :deep(.cart-header h5),
.panel-body :deep(.panel-general h3),
.panel-body :deep(.panel-general h4),
.panel-body :deep(.panel-general h5) {
  font-size: 0.96rem;
}

.panel-body :deep(.field-help),
.panel-body :deep(.subtext),
.panel-body :deep(.hint),
.panel-body :deep(.section-subtitle),
.panel-body :deep(.module-help) {
  font-size: 13px;
  line-height: 1.3;
}

.panel-body :deep(select),
.panel-body :deep(input),
.panel-body :deep(button),
.panel-body :deep(.btn-primary),
.panel-body :deep(.btn-ghost),
.panel-body :deep(.btn-mini),
.panel-body :deep(.alink) {
  font-size: 14px;
}

.panel-body :deep(select),
.panel-body :deep(input) {
  padding-top: 7px;
  padding-bottom: 7px;
}

.panel-body :deep(.btn-primary),
.panel-body :deep(.btn-ghost),
.panel-body :deep(.btn-mini),
.panel-body :deep(.alink) {
  padding-top: 7px;
  padding-bottom: 7px;
}

.panel-body :deep(.cart-list),
.panel-body :deep(.post-list),
.panel-body :deep(.list) {
  max-height: 180px;
}

.panel-body :deep(.cart-item),
.panel-body :deep(.post-item),
.panel-body :deep(.subroute-item),
.panel-body :deep(.link-card),
.panel-body :deep(.link-item),
.panel-body :deep(.leg-item),
.panel-body :deep(.cell) {
  padding-top: 8px;
  padding-bottom: 8px;
}

@media (max-width: 1440px) {
  .panel {
    width: clamp(320px, 30vw, 430px);
    max-height: min(68vh, calc(100vh - 120px));
  }

  .panel-body {
    max-height: calc(min(68vh, 100vh - 120px) - 58px);
  }
}

@media (max-width: 1100px) {
  .panel {
    right: 16px;
    bottom: 16px;
    width: clamp(300px, 34vw, 390px);
    max-width: calc(100vw - 32px);
    max-height: min(68vh, calc(100vh - 120px));
  }

  .panel-header {
    padding: 11px 13px;
  }

  .panel-body {
    padding: 10px 12px 12px;
    max-height: calc(min(68vh, 100vh - 120px) - 58px);
  }

  .panel-header h4 {
    font-size: 16px;
  }
}

@media (max-width: 820px) {
  .panel {
    right: 12px;
    left: auto;
    bottom: 12px;
    width: min(390px, calc(100vw - 330px));
    max-width: calc(100vw - 330px);
    max-height: min(68vh, calc(100vh - 120px));
    border-radius: 12px;
  }

  .panel-body {
    max-height: calc(min(68vh, 100vh - 120px) - 58px);
  }
}

@media (max-width: 640px) {
  .panel {
    right: 10px;
    left: 10px;
    bottom: 10px;
    width: auto;
    max-width: none;
    max-height: min(48vh, calc(100vh - 120px));
    border-radius: 12px;
  }

  .panel-header {
    padding: 10px 12px;
  }

  .panel-body {
    padding: 9px 11px 11px;
    max-height: calc(48vh - 50px);
  }

  .panel-header h4 {
    font-size: 16px;
  }

  .btn-mini {
    padding: 8px 10px;
    font-size: 12px;
  }
}
</style>
