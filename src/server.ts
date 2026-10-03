import 'dotenv/config'

import { buildApp } from './app.js'

import {
  checkDatabaseConnection,
  closeDatabaseConnection
} from './db/pool.js'

import { env } from './config/env.js'

const app = buildApp()

async function start() {
  try {
    await checkDatabaseConnection()

    app.log.info(
      'Database connection verified'
    )

    await app.listen({
      port: env.port,
      host: env.host
    })
  } catch (error) {
    app.log.error(error)

    await closeDatabaseConnection()

    process.exit(1)
  }
}

async function shutdown(signal: string) {
  app.log.info(
    { signal },
    'Shutting down application'
  )

  try {
    await app.close()

    await closeDatabaseConnection()

    process.exit(0)
  } catch (error) {
    app.log.error(error)

    process.exit(1)
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

await start()