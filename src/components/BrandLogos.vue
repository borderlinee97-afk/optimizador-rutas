<template>
  <div class="partner-logos" aria-label="FMEDICAL y PENSIV">
    <img class="partner-logo partner-logo--fmedical" src="/branding/fmedical.png" alt="FMEDICAL" width="100" height="55" />
    <span class="partner-logo-divider" aria-hidden="true"></span>
    <img class="partner-logo partner-logo--pensiv" src="/branding/pensiv.png" alt="PENSIV" width="80" height="44" />
  </div>
</template>

<style scoped>
.partner-logos { display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; }
.partner-logo { display: block; object-fit: contain; flex-shrink: 1; min-width: 0; }
.partner-logo--fmedical { width: 100px; height: 55px; }
.partner-logo--pensiv { width: 80px; height: 44px; }
.partner-logo-divider { width: 1px; height: 27px; background: #e5ebed; flex-shrink: 0; }
@media print { .partner-logos { display: none; } }
</style>
