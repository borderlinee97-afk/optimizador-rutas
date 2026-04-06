import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { Loader } from '@googlemaps/js-api-loader'

// Carga Google Maps JS API UNA vez antes de montar Vue
const loader = new Loader({
  apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  version: 'weekly',
})

loader.load()
  .then(() => {
    createApp(App).mount('#app')
  })
  .catch((err) => {
    console.error('Error cargando Google Maps JS API:', err)
  })