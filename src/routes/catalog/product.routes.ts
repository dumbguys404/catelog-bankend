import type { FastifyPluginAsync } from 'fastify'

import { getTenantContext } from '../../plugins/tenant-context.js'
import {
    availabilityValues,
    collectionTypes,
    csvNumberListSchema,
    idParamsSchema,
    omitUndefined,
    paginationQueryProperties,
    parseLimit,
    parseNumberList,
    parseOptionalBoolean,
    parseOptionalNumber,
    parsePage,
    parseString,
    sortValues,
    type QueryRecord
} from '../../utils/query.js'

const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        search: {
            type: 'string',
            minLength: 1
        },
        categoryIds: csvNumberListSchema,
        includeChildCategories: {
            type: 'boolean'
        },
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

export const catalogProductRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', {
        schema: {
            querystring: listQuerySchema
        }
    }, async (request) => {
        const query = request.query as QueryRecord
        const page = parsePage(query)
        const limit = parseLimit(query)

        return {
            tenant: getTenantContext(request),
            filters: omitUndefined({
                search: parseString(query, 'search'),
                categoryIds: parseNumberList(query, 'categoryIds'),
                includeChildCategories:
                    parseOptionalBoolean(query, 'includeChildCategories') ?? true,
                brandIds: parseNumberList(query, 'brandIds'),
                collectionIds: parseNumberList(query, 'collectionIds'),
                collectionType: parseString(query, 'collectionType'),
                availability: parseString(query, 'availability'),
                minPrice: parseOptionalNumber(query, 'minPrice'),
                maxPrice: parseOptionalNumber(query, 'maxPrice'),
                sort: parseString(query, 'sort')
            }),
            pagination: {
                page,
                limit,
                total: 1
            },
            data: [
                {
                    id: 100,
                    name: 'Demo Silk Saree',
                    slug: 'demo-silk-saree',
                    price: 2499,
                    mrp: 2999,
                    availability: 'AVAILABLE',
                    brand: {
                        id: 1,
                        name: 'Demo Brand'
                    },
                    primaryImage: {
                        objectKey: 'demo/products/100/main.webp'
                    }
                }
            ]
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
                id: params.id,
                name: 'Demo Silk Saree',
                slug: 'demo-silk-saree',
                price: 2499,
                mrp: 2999,
                availability: 'AVAILABLE'
            }
        }
    })
}
