import type { FastifyPluginAsync } from 'fastify'

import { getTenantContext } from '../../plugins/tenant-context.js'
import {
    collectionTypes,
    idParamsSchema,
    omitUndefined,
    parseOptionalBoolean,
    parseString,
    type QueryRecord
} from '../../utils/query.js'

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
        }
    }
}

export const catalogCollectionRoutes: FastifyPluginAsync = async (app) => {
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
            data: [
                {
                    id: 1,
                    name: 'New Arrivals',
                    type: 'NEW_ARRIVAL'
                },
                {
                    id: 2,
                    name: 'Trending',
                    type: 'TRENDING'
                },
                {
                    id: 3,
                    name: 'Onam Collection 2026',
                    type: 'FESTIVAL'
                },
                {
                    id: 4,
                    name: 'Featured',
                    type: 'FEATURED'
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
                name: 'New Arrivals',
                type: 'NEW_ARRIVAL'
            }
        }
    })
}
