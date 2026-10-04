import type { FastifyPluginAsync } from 'fastify'
import { idParamsSchema } from '../../utils/query.js'
import {
    listQuerySchema,
    createBodySchema,
    updateBodySchema,
    collectionIdParamsSchema,
    collectionProductsBodySchema,
} from './collection.schema.js'
import {
    adminListCollections,
    adminGetCollection,
    adminCreateCollection,
    adminUpdateCollection,
    adminDeleteCollection,
    adminListCollectionProducts,
    adminUpdateCollectionProducts,
    catalogListCollections,
    catalogGetCollection,
    catalogGetCollectionProducts,
} from './collection.controller.js'

const adminCollectionProductRoutes: FastifyPluginAsync = async (app) => {
    app.get(
        '/:collectionId/products',
        { schema: { params: collectionIdParamsSchema } },
        adminListCollectionProducts,
    )
    app.put(
        '/:collectionId/products',
        { schema: { params: collectionIdParamsSchema, body: collectionProductsBodySchema } },
        adminUpdateCollectionProducts,
    )
}

export const adminCollectionRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, adminListCollections)
    app.get('/:id', { schema: { params: idParamsSchema } }, adminGetCollection)
    app.post('/', { schema: { body: createBodySchema } }, adminCreateCollection)
    app.patch(
        '/:id',
        { schema: { params: idParamsSchema, body: updateBodySchema } },
        adminUpdateCollection,
    )
    app.delete('/:id', { schema: { params: idParamsSchema } }, adminDeleteCollection)

    app.register(adminCollectionProductRoutes)
}

export const catalogCollectionRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', catalogListCollections)
    app.get('/:id', { schema: { params: idParamsSchema } }, catalogGetCollection)
    app.get(
        '/:collectionId/products',
        { schema: { params: collectionIdParamsSchema } },
        catalogGetCollectionProducts,
    )
}
