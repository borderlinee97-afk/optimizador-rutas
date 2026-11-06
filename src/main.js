import {
  createApp,
} from 'vue'

import './style.css'
import {installClientDiagnostics} from './services/clientDiagnostics.js'

import App
  from './App.vue'

import router
  from './router/index.js'

import {
  Loader,
} from '@googlemaps/js-api-loader'

const loader =
  new Loader({
    apiKey:
      import.meta.env
        .VITE_GOOGLE_MAPS_API_KEY,

    version:
      'weekly',
  })

loader
  .load()
  .then(
    () => {
      const app =
        createApp(
          App,
        )

      app.use(
        router,
      )

      installClientDiagnostics(app,router)

      app.mount(
        '#app',
      )
    },
  )
  .catch(
    err => {
      console.error(
        'Error cargando Google Maps JS API:',
        err,
      )
    },
  )
