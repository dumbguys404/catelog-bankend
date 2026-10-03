import type { FastifyPluginAsync } from 'fastify'

import { getTenantContext } from '../../plugins/tenant-context.js'
import {
    csvNumberListSchema,
    idParamsSchema,
    omitUndefined,
    parseNumberList,
    parseOptionalBoolean,
    parseString,
    type QueryRecord
} from '../../utils/query.js'

const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        categoryIds: csvNumberListSchema,
        collectionIds: csvNumberListSchema,
        hasProducts: {
            type: 'boolean'
        },
        status: {
            type: 'string',
            minLength: 1
        }
    }
}

export const catalogBrandRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', {
        schema: {
            querystring: listQuerySchema
        }
    }, async (request) => {
        const query = request.query as QueryRecord

        return {
            tenant: getTenantContext(request),
            filters: omitUndefined({
                categoryIds: parseNumberList(query, 'categoryIds'),
                collectionIds: parseNumberList(query, 'collectionIds'),
                hasProducts: parseOptionalBoolean(query, 'hasProducts'),
                status: parseString(query, 'status')
            }),
            data: [
                {
                    id: 1,
                    name: 'Demo Brand',
                    slug: 'demo-brand'
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
                name: 'Demo Brand',
                slug: 'demo-brand'
            }
        }
    })
}
