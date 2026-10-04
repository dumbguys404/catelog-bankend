import type { FastifyPluginAsync } from 'fastify'
import { idParamsSchema } from '../../utils/query.js'
import { listQuerySchema, createBodySchema, updateBodySchema } from './category.schema.js'
import {
    adminListCategoriesHandler,
    adminGetCategoryHandler,
    adminCreateCategoryHandler,
    adminUpdateCategoryHandler,
    adminDeleteCategoryHandler,
    catalogListCategoriesHandler,
    catalogGetCategoryHandler,
} from './category.controller.js'

export const adminCategoryRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, adminListCategoriesHandler)
    app.get('/:id', { schema: { params: idParamsSchema } }, adminGetCategoryHandler)
    app.post('/', { schema: { body: createBodySchema } }, adminCreateCategoryHandler)
    app.patch(
        '/:id',
        { schema: { params: idParamsSchema, body: updateBodySchema } },
        adminUpdateCategoryHandler,
    )
    app.delete('/:id', { schema: { params: idParamsSchema } }, adminDeleteCategoryHandler)
}

export const catalogCategoryRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', catalogListCategoriesHandler)
    app.get('/:id', { schema: { params: idParamsSchema } }, catalogGetCategoryHandler)
}
