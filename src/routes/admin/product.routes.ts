import type { FastifyPluginAsync } from 'fastify'

import { getTenantContext } from '../../plugins/tenant-context.js'
import {
    availabilityValues,
    collectionTypes,
    csvNumberListSchema,
    emptyObjectBodySchema,
    idParamsSchema,
    omitUndefined,
    paginationQueryProperties,
    parseLimit,
    parseNumberList,
    parseOptionalNumber,
    parsePage,
    parseString,
    sortValues,
    type QueryRecord
} from '../../utils/query.js'

const productIdParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['productId'],
    properties: {
        productId: {
            type: 'integer',
            minimum: 1
        }
    }
}

const productImageParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['productId', 'imageId'],
    properties: {
        productId: {
            type: 'integer',
            minimum: 1
        },
        imageId: {
            type: 'integer',
            minimum: 1
        }
    }
}

const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        search: {
            type: 'string',
            minLength: 1
        },
        categoryIds: csvNumberListSchema,
        brandIds: csvNumberListSchema,
        collectionIds: csvNumberListSchema,
        collectionType: {
            type: 'string',
            enum: collectionTypes
        },
        availability: {
            type: 'string',
            enum: availabilityValues
        },
        status: {
            type: 'string',
            minLength: 1
        },
        minPrice: {
            type: 'number',
            minimum: 0
        },
        maxPrice: {
            type: 'number',
            minimum: 0
        },
        sort: {
            type: 'string',
            enum: sortValues
        },
        ...paginationQueryProperties
    }
}

const productCategoriesBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['categoryIds'],
    properties: {
        categoryIds: {
            type: 'array',
            items: {
                type: 'integer',
                minimum: 1
            }
        }
    }
}

type ProductCategoriesBody = {
    categoryIds: number[]
}

export const adminProductRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', {
        schema: {
            querystring: listQuerySchema
        }
    }, async (request) => {
        const query = request.query as QueryRecord

        return {
            tenant: getTenantContext(request),
            filters: omitUndefined({
                search: parseString(query, 'search'),
                categoryIds: parseNumberList(query, 'categoryIds'),
                brandIds: parseNumberList(query, 'brandIds'),
                collectionIds: parseNumberList(query, 'collectionIds'),
                collectionType: parseString(query, 'collectionType'),
                availability: parseString(query, 'availability'),
                status: parseString(query, 'status'),
                minPrice: parseOptionalNumber(query, 'minPrice'),
                maxPrice: parseOptionalNumber(query, 'maxPrice'),
                sort: parseString(query, 'sort')
            }),
            data: [],
            pagination: {
                page: parsePage(query),
                limit: parseLimit(query),
                total: 0
            }
        }
    })

    app.get('/:id', {
        schema: {
            params: idParamsSchema
        }
    }, async (request) => {
        const params = request.params as { id: number }

        return {
            tenant: getTenantContext(request),
            data: {
                id: params.id
            }
        }
    })

    app.post('/', {
        schema: {
            body: emptyObjectBodySchema
        }
    }, async (_request, reply) => {
        return reply.code(201).send({
            success: true,
            message: 'Created',
            data: {
                id: 1
            }
        })
    })

    app.patch('/:id', {
        schema: {
            params: idParamsSchema,
            body: emptyObjectBodySchema
        }
    }, async (request) => {
        const params = request.params as { id: number }

        return {
            success: true,
            message: 'Updated',
            data: {
                id: params.id
            }
        }
    })

    app.delete('/:id', {
        schema: {
            params: idParamsSchema
        }
    }, async () => ({
        success: true,
        message: 'Deleted'
    }))

    app.get('/:productId/images', {
        schema: {
            params: productIdParamsSchema
        }
    }, async (request) => {
        const params = request.params as { productId: number }

        return {
            tenant: getTenantContext(request),
            productId: params.productId,
            data: []
        }
    })

    app.post('/:productId/images', {
        schema: {
            params: productIdParamsSchema,
            body: emptyObjectBodySchema
        }
    }, async (request, reply) => {
        const params = request.params as { productId: number }

        return reply.code(201).send({
            success: true,
            message: 'Product image endpoint is working',
            data: {
                productId: params.productId,
                imageId: 1,
                objectKey: 'mock/product/image.webp'
            }
        })
    })

    app.patch('/:productId/images/:imageId', {
        schema: {
            params: productImageParamsSchema,
            body: emptyObjectBodySchema
        }
    }, async (request) => {
        const params =
            request.params as { productId: number, imageId: number }

        return {
            success: true,
            message: 'Updated',
            data: {
                productId: params.productId,
                imageId: params.imageId
            }
        }
    })

    app.delete('/:productId/images/:imageId', {
        schema: {
            params: productImageParamsSchema
        }
    }, async () => ({
        success: true,
        message: 'Deleted'
    }))

    app.get('/:productId/categories', {
        schema: {
            params: productIdParamsSchema
        }
    }, async (request) => {
        const params = request.params as { productId: number }

        return {
            tenant: getTenantContext(request),
            productId: params.productId,
            categoryIds: [10, 15]
        }
    })

    app.put('/:productId/categories', {
        schema: {
            params: productIdParamsSchema,
            body: productCategoriesBodySchema
        }
    }, async (request) => {
        const params = request.params as { productId: number }
        const body = request.body as ProductCategoriesBody

        return {
            success: true,
            productId: params.productId,
            categoryIds: body.categoryIds
        }
    })
}
