import type { FastifyPluginAsync } from 'fastify'

import { getTenantContext } from '../../plugins/tenant-context.js'
import {
    collectionTypes,
    emptyObjectBodySchema,
    idParamsSchema,
    omitUndefined,
    paginationQueryProperties,
    parseLimit,
    parseOptionalBoolean,
    parsePage,
    parseString,
    type QueryRecord
} from '../../utils/query.js'

const collectionIdParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['collectionId'],
    properties: {
        collectionId: {
            type: 'integer',
            minimum: 1
        }
    }
}

const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            enum: collectionTypes
        },
        status: {
            type: 'string',
            minLength: 1
        },
        activeNow: {
            type: 'boolean'
        },
        ...paginationQueryProperties
    }
}

const collectionProductsBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['products'],
    properties: {
        products: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['productId', 'displayOrder'],
                properties: {
                    productId: {
                        type: 'integer',
                        minimum: 1
                    },
                    displayOrder: {
                        type: 'integer',
                        minimum: 0
                    }
                }
            }
        }
    }
}

type CollectionProductsBody = {
    products: Array<{
        productId: number
        displayOrder: number
    }>
}

export const adminCollectionRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', {
        schema: {
            querystring: listQuerySchema
        }
    }, async (request) => {
        const query = request.query as QueryRecord

        return {
            tenant: getTenantContext(request),
            filters: omitUndefined({
                type: parseString(query, 'type'),
                status: parseString(query, 'status'),
                activeNow: parseOptionalBoolean(query, 'activeNow')
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

    app.get('/:collectionId/products', {
        schema: {
            params: collectionIdParamsSchema
        }
    }, async (request) => {
        const params = request.params as { collectionId: number }

        return {
            tenant: getTenantContext(request),
            collectionId: params.collectionId,
            data: []
        }
    })

    app.put('/:collectionId/products', {
        schema: {
            params: collectionIdParamsSchema,
            body: collectionProductsBodySchema
        }
    }, async (request) => {
        const params = request.params as { collectionId: number }
        const body = request.body as CollectionProductsBody

        return {
            success: true,
            collectionId: params.collectionId,
            products: body.products
        }
    })
}
