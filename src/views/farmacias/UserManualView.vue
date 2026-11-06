<template>
  <main class="user-manual">
    <header class="page-header">
      <span>Ayuda operativa</span>
      <h1>{{ manual.title }}</h1>
      <p>{{ manual.edition }}</p>
      <a
        class="manual-download"
        href="/manual/Manual-APP-DE-RUTAS.pdf"
        target="_blank"
        rel="noopener"
        >Descargar manual PDF</a
      >
    </header>
    <p>{{ manual.intro }}</p>
    <nav aria-label="Contenido del manual">
      <a
        v-for="(section, i) in manual.sections"
        :key="section.title"
        :href="'#section-' + i"
        >{{ section.title }}</a
      ><a href="#flow">Diagrama de flujo</a>
    </nav>
    <section
      v-for="(section, i) in manual.sections"
      :id="'section-' + i"
      :key="section.title"
    >
      <h2>{{ section.title }}</h2>
      <ol>
        <li v-for="step in section.steps" :key="step">{{ step }}</li>
      </ol>
    </section>
    <section id="flow">
      <h2>Diagrama de flujo operativo</h2>
      <img
        src="/manual/flujo-operativo.svg"
        alt="Flujo de acceso, planeación, autorización, ejecución, sincronización y seguimiento"
      /><a href="/manual/flujo-operativo.svg" target="_blank" rel="noopener"
        >Abrir diagrama completo</a
      >
    </section>
  </main>
</template>
<script setup>
import manual from "../../../mobile/src/content/userManual.json";
</script>
<style scoped>
.user-manual {
  max-width: 1000px;
  margin: auto;
  padding: 28px;
  line-height: 1.7;
}
.user-manual nav {
  display: grid;
  gap: 8px;
  padding: 20px;
  background: #fff;
  border: 1px solid #cbd5df;
  border-radius: 12px;
}
.user-manual section {
  margin-top: 22px;
  padding: 24px;
  background: #fff;
  border: 1px solid #cbd5df;
  border-radius: 12px;
  scroll-margin-top: 100px;
}
.user-manual h2 {
  font-size: 22px;
}
.user-manual li {
  padding: 6px 0;
}
.user-manual a {
  color: #075671;
  font-weight: 700;
}
.manual-download {
  display: inline-block;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #096e91;
  border-radius: 8px;
}
.user-manual img {
  display: block;
  max-width: 100%;
  height: auto;
}
@media (max-width: 600px) {
  .user-manual {
    padding: 16px;
  }
  .user-manual section {
    padding: 16px;
  }
}
</style>
