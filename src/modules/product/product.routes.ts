import type { FastifyPluginAsync } from 'fastify'
import { idParamsSchema } from '../../utils/query.js'
import { listQuerySchema } from './product.schema.js'
import { createProductBodySchema, updateProductBodySchema } from './product.schema.js'
import {
    productIdParamsSchema,
    productImageParamsSchema,
    uploadUrlBodySchema,
    createImageBodySchema,
    updateImageBodySchema,
} from './product-image.schema.js'
import { productCategoriesBodySchema } from './product-category.controller.js'
import {
    listAdminProducts,
    getAdminProductHandler,
    createAdminProductHandler,
    updateAdminProductHandler,
    deleteAdminProductHandler,
    listCatalogProducts,
    getCatalogProductHandler,
} from './product.controller.js'
import {
    listAdminImages,
    getUploadUrl,
    registerImage,
    updateAdminImage,
    deleteAdminImage,
} from './product-image.controller.js'
import {
    listAdminProductCategories,
    updateAdminProductCategories,
} from './product-category.controller.js'

const adminProductImageRoutes: FastifyPluginAsync = async (app) => {
    app.get('/:productId/images', { schema: { params: productIdParamsSchema } }, listAdminImages)
    app.post(
        '/:productId/images/upload-url',
        { schema: { params: productIdParamsSchema, body: uploadUrlBodySchema } },
        getUploadUrl,
    )
    app.post(
        '/:productId/images',
        { schema: { params: productIdParamsSchema, body: createImageBodySchema } },
        registerImage,
    )
    app.post(
        '/:productId/images/complete',
        { schema: { params: productIdParamsSchema, body: createImageBodySchema } },
        registerImage,
    )
    app.patch(
        '/:productId/images/:imageId',
        { schema: { params: productImageParamsSchema, body: updateImageBodySchema } },
        updateAdminImage,
    )
    app.delete(
        '/:productId/images/:imageId',
        { schema: { params: productImageParamsSchema } },
        deleteAdminImage,
    )
}

const adminProductCategoryRoutes: FastifyPluginAsync = async (app) => {
    app.get(
        '/:productId/categories',
        { schema: { params: productIdParamsSchema } },
        listAdminProductCategories,
    )
    app.put(
        '/:productId/categories',
        { schema: { params: productIdParamsSchema, body: productCategoriesBodySchema } },
        updateAdminProductCategories,
    )
}

export const adminProductRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, listAdminProducts)
    app.get('/:id', { schema: { params: idParamsSchema } }, getAdminProductHandler)
    app.post('/', { schema: { body: createProductBodySchema } }, createAdminProductHandler)
    app.patch(
        '/:id',
        { schema: { params: idParamsSchema, body: updateProductBodySchema } },
        updateAdminProductHandler,
    )
    app.delete('/:id', { schema: { params: idParamsSchema } }, deleteAdminProductHandler)

    app.register(adminProductImageRoutes)
    app.register(adminProductCategoryRoutes)
}

export const catalogProductRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, listCatalogProducts)
    app.get('/:id', { schema: { params: idParamsSchema } }, getCatalogProductHandler)
}
