import { collectionTypes, paginationQueryProperties } from '../../utils/query.js'

export const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: paginationQueryProperties,
}
export const collectionProperties = {
    name: { type: 'string', minLength: 1, maxLength: 150 },
    slug: { type: 'string', minLength: 1, maxLength: 160 },
    type: { type: 'string', enum: collectionTypes },
    description: { type: ['string', 'null'] },
    imageKey: { type: ['string', 'null'], maxLength: 500 },
    startAt: { type: ['string', 'null'] },
    endAt: { type: ['string', 'null'] },
    displayOrder: { type: 'integer', minimum: 0 },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
}
export const createBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'slug', 'type'],
    properties: collectionProperties,
}
export const updateBodySchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: collectionProperties,
}
export type CollectionBody = {
    name?: string
    slug?: string
    type?: (typeof collectionTypes)[number]
    description?: string | null
    imageKey?: string | null
    startAt?: string | null
    endAt?: string | null
    displayOrder?: number
    status?: 'ACTIVE' | 'INACTIVE'
}
export const collectionColumns: Partial<Record<keyof CollectionBody, string>> = {
    name: 'name',
    slug: 'slug',
    type: 'collection_type',
    description: 'description',
    imageKey: 'image_key',
    startAt: 'start_at',
    endAt: 'end_at',
    displayOrder: 'display_order',
    status: 'status',
}

export type AdminCollectionRow = {
    id: string | number
    tenant_id: string | number
    name: string
    slug: string
    collection_type: (typeof collectionTypes)[number]
    description: string | null
    image_key: string | null
    start_at: string | Date | null
    end_at: string | Date | null
    display_order: number
    status: 'ACTIVE' | 'INACTIVE'
    created_at: string | Date
    updated_at: string | Date
}

export type CatalogCollectionRow = {
    id: string | number
    name: string
    slug: string
    collection_type: 'NEW_ARRIVAL' | 'TRENDING' | 'FESTIVAL' | 'FEATURED'
    description: string | null
    image_key: string | null
    start_at: string | Date | null
    end_at: string | Date | null
    display_order: number
}

export const collectionIdParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['collectionId'],
    properties: { collectionId: { type: 'integer', minimum: 1 } },
}
export const collectionProductsBodySchema = {
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
                    productId: { type: 'integer', minimum: 1 },
                    displayOrder: { type: 'integer', minimum: 0 },
                },
            },
        },
    },
}
export type CollectionProductsBody = {
    products: Array<{ productId: number; displayOrder: number }>
}
export type CollectionProductRow = {
    product_id: string | number
    display_order: number
    name: string
    slug: string
    status: 'ACTIVE' | 'INACTIVE'
}

export type CatalogProductRow = {
    id: string | number
    name: string
    slug: string
    price: string | number | null
    mrp: string | number | null
    availability: string
    display_order: number
    object_key: string | null
    alt_text: string | null
}
