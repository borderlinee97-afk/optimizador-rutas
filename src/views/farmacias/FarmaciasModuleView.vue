<template>
  <main class="farmacias-module-view">
    <div class="module-container">
      <header class="module-header">
        <span class="module-kicker">
          {{ kicker }}
        </span>

        <h1>
          {{ title }}
        </h1>

        <p>
          {{ description }}
        </p>
      </header>

      <section class="module-card">
        <div class="module-card-header">
          <div class="module-card-icon">
            {{ moduleInitial }}
          </div>

          <div>
            <span>
              Módulo
            </span>

            <strong>
              {{ title }}
            </strong>
          </div>
        </div>

        <div class="module-divider"></div>

        <div class="module-scope">
          <span class="module-scope-label">
            Alcance previsto
          </span>

          <div class="module-items">
            <div
              v-for="item in sections"
              :key="item"
              class="module-item"
            >
              <span class="module-item-dot"></span>

              <span>
                {{ item }}
              </span>
            </div>
          </div>
        </div>

        <div class="module-status">
          <span class="module-status-dot"></span>

          <div>
            <strong>
              Estructura preparada
            </strong>

            <span>
              Este módulo ya forma parte de la
              navegación. La siguiente fase
              conectará sus datos y acciones
              operativas.
            </span>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import {
  computed,
} from 'vue'

import {
  useRoute,
} from 'vue-router'

const route =
  useRoute()

const kicker =
  computed(
    () =>
      String(
        route.meta?.kicker ||
        'Farmacias',
      )
  )

const title =
  computed(
    () =>
      String(
        route.meta?.title ||
        'Módulo',
      )
  )

const description =
  computed(
    () =>
      String(
        route.meta?.description ||
        '',
      )
  )

const sections =
  computed(
    () =>
      Array.isArray(
        route.meta?.sections,
      )
        ? route.meta.sections
        : []
  )

const moduleInitial =
  computed(
    () =>
      title.value
        .charAt(
          0,
        )
        .toUpperCase()
  )
</script>

<style scoped>
.farmacias-module-view {
  min-height: 100vh;

  padding:
    108px
    28px
    48px;

  background:
    linear-gradient(
      145deg,
      #f8fafc,
      #eef6fb
    );

  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.module-container {
  width: min(
    1100px,
    100%
  );

  margin: 0 auto;
}

.module-header {
  max-width: 720px;
}

.module-kicker {
  color: #0f64ad;

  font-size: 13px;
  font-weight: 900;

  letter-spacing: .09em;

  text-transform: uppercase;
}

.module-header h1 {
  margin:
    7px
    0
    8px;

  color: #0f172a;

  font-size: 30px;

  line-height: 1.15;
}

.module-header p {
  margin: 0;

  color: #64748b;

  font-size: 16px;

  line-height: 1.6;
}

.module-card {
  width: min(
    680px,
    100%
  );

  margin-top: 26px;

  padding: 22px;

  border:
    1px solid #e2e8f0;

  border-radius: 22px;

  background:
    rgba(
      255,
      255,
      255,
      .96
    );

  box-shadow:
    0 18px 50px
      rgba(
        15,
        23,
        42,
        .08
      );
}

.module-card-header {
  display: flex;

  align-items: center;

  gap: 13px;
}

.module-card-icon {
  display: grid;

  width: 44px;
  height: 44px;

  flex: 0 0 44px;

  place-items: center;

  border-radius: 14px;

  background: #eaf4fc;

  color: #0f64ad;

  font-size: 17px;
  font-weight: 900;
}

.module-card-header > div:last-child {
  display: flex;

  flex-direction: column;
}

.module-card-header span {
  color: #64748b;

  font-size: 12px;
  font-weight: 800;

  text-transform: uppercase;
}

.module-card-header strong {
  margin-top: 2px;

  color: #0f172a;

  font-size: 16px;
}

.module-divider {
  height: 1px;

  margin: 18px 0;

  background: #eef2f7;
}

.module-scope-label {
  color: #475569;

  font-size: 12px;
  font-weight: 900;

  letter-spacing: .05em;

  text-transform: uppercase;
}

.module-items {
  display: grid;

  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );

  gap: 9px;

  margin-top: 12px;
}

.module-item {
  display: flex;

  align-items: center;

  gap: 8px;

  min-height: 42px;

  padding: 9px 11px;

  border:
    1px solid #edf2f7;

  border-radius: 11px;

  background: #f8fafc;

  color: #334155;

  font-size: 13px;
  font-weight: 650;
}

.module-item-dot {
  width: 7px;
  height: 7px;

  flex: 0 0 7px;

  border-radius: 999px;

  background: #2596d1;
}

.module-status {
  display: flex;

  align-items: flex-start;

  gap: 10px;

  margin-top: 18px;

  padding: 13px;

  border-radius: 13px;

  background: #f0fdf4;
}

.module-status-dot {
  width: 8px;
  height: 8px;

  flex: 0 0 8px;

  margin-top: 4px;

  border-radius: 999px;

  background: #22c55e;
}

.module-status > div {
  display: flex;

  flex-direction: column;
}

.module-status strong {
  color: #166534;

  font-size: 13px;
}

.module-status span {
  margin-top: 3px;

  color: #4b7660;

  font-size: 12px;

  line-height: 1.5;
}

@media (
  max-width: 680px
) {
  .farmacias-module-view {
    padding:
      132px
      16px
      32px;
  }

  .module-header h1 {
    font-size: 25px;
  }

  .module-items {
    grid-template-columns:
      1fr;
  }
}
</style>