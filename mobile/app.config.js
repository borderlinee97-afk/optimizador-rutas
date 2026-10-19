const { existsSync } = require('node:fs')
const { join } = require('node:path')
const hasLocalFirebaseConfig = existsSync(join(__dirname, 'google-services.json'))

module.exports = ({ config }) => ({
  ...config,

  android: {
    ...config.android,
    ...((process.env.GOOGLE_SERVICES_JSON || config.android?.googleServicesFile || hasLocalFirebaseConfig)
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON || config.android?.googleServicesFile || './google-services.json' }
      : {}),

    config: {
      ...(config.android?.config ?? {}),

      googleMaps: {
        ...(config.android?.config?.googleMaps ?? {}),

        apiKey:
          process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    },
  },
})