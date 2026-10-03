import Fastify from 'fastify'
import type { FastifyError } from 'fastify'

import { requirePlatformAdmin, requireTenantAdmin } from './plugins/auth.js'
import { attachTenantContext } from './plugins/tenant-context.js'
import { adminBrandRoutes } from './routes/admin/brand.routes.js'
import { adminCategoryRoutes } from './routes/admin/category.routes.js'
import { adminCollectionRoutes } from './routes/admin/collection.routes.js'
import { adminProductRoutes } from './routes/admin/product.routes.js'
import { catalogBrandRoutes } from './routes/catalog/brand.routes.js'
import { catalogCategoryRoutes } from './routes/catalog/category.routes.js'
import { catalogCollectionRoutes } from './routes/catalog/collection.routes.js'
import { catalogProductRoutes } from './routes/catalog/product.routes.js'
import { platformTenantRoutes } from './routes/platform/tenant.routes.js'

export function buildApp() {
  const app = Fastify({
    logger: true
  })

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500

    if (statusCode === 400) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: error.message
      })
    }

    if (statusCode === 401) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      })
    }

    request.log.error(error)

    return reply.code(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error'
    })
  })

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: 'NOT_FOUND',
      message: 'Route not found'
    })
  })

  app.get('/health', async () => ({
    status: 'ok',
    service: 'catalog-backend'
  }))

  app.register(async (catalogApp) => {
    catalogApp.addHook('preHandler', attachTenantContext)

    catalogApp.register(catalogCategoryRoutes, {
      prefix: '/categories'
    })

    catalogApp.register(catalogBrandRoutes, {
      prefix: '/brands'
    })

    catalogApp.register(catalogProductRoutes, {
      prefix: '/products'
    })

    catalogApp.register(catalogCollectionRoutes, {
      prefix: '/collections'
    })
  }, {
    prefix: '/api/catalog'
  })

  app.register(async (adminApp) => {
    adminApp.addHook('preHandler', attachTenantContext)
    adminApp.addHook('preHandler', requireTenantAdmin)

    adminApp.register(adminCategoryRoutes, {
      prefix: '/categories'
    })

    adminApp.register(adminBrandRoutes, {
      prefix: '/brands'
    })

    adminApp.register(adminProductRoutes, {
      prefix: '/products'
    })

    adminApp.register(adminCollectionRoutes, {
      prefix: '/collections'
    })
  }, {
    prefix: '/api/admin'
  })

  app.register(async (platformApp) => {
    platformApp.addHook('preHandler', requirePlatformAdmin)

    platformApp.register(platformTenantRoutes, {
      prefix: '/tenants'
    })
  }, {
    prefix: '/api/platform'
  })

  return app
}
