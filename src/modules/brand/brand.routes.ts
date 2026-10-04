import type { FastifyPluginAsync } from 'fastify'
import { idParamsSchema } from '../../utils/query.js'
import { listQuerySchema, createBodySchema, updateBodySchema } from './brand.schema.js'
import {
    adminListBrandsHandler,
    adminGetBrandHandler,
    adminCreateBrandHandler,
    adminUpdateBrandHandler,
    adminDeleteBrandHandler,
    catalogListBrandsHandler,
    catalogGetBrandHandler,
} from './brand.controller.js'

export const adminBrandRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, adminListBrandsHandler)
    app.get('/:id', { schema: { params: idParamsSchema } }, adminGetBrandHandler)
    app.post('/', { schema: { body: createBodySchema } }, adminCreateBrandHandler)
    app.patch(
        '/:id',
        { schema: { params: idParamsSchema, body: updateBodySchema } },
        adminUpdateBrandHandler,
    )
    app.delete('/:id', { schema: { params: idParamsSchema } }, adminDeleteBrandHandler)
}

export const catalogBrandRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', catalogListBrandsHandler)
    app.get('/:id', { schema: { params: idParamsSchema } }, catalogGetBrandHandler)
}
