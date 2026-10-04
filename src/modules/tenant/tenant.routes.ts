import type { FastifyPluginAsync } from 'fastify'
import { idParamsSchema } from '../../utils/query.js'
import { listQuerySchema, createBodySchema, updateBodySchema } from './tenant.schema.js'
import {
    listTenantsHandler,
    getTenantHandler,
    createTenantHandler,
    updateTenantHandler,
    deleteTenantHandler,
} from './tenant.controller.js'

export const platformTenantRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, listTenantsHandler)
    app.get('/:id', { schema: { params: idParamsSchema } }, getTenantHandler)
    app.post('/', { schema: { body: createBodySchema } }, createTenantHandler)
    app.patch(
        '/:id',
        { schema: { params: idParamsSchema, body: updateBodySchema } },
        updateTenantHandler,
    )
    app.delete('/:id', { schema: { params: idParamsSchema } }, deleteTenantHandler)
}
