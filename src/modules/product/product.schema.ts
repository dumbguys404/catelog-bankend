import { availabilityValues, paginationQueryProperties } from '../../utils/query.js'

export type ProductRow = {
    id: string | number
    tenant_id: string | number
    brand_id: string | number | null
    name: string
    slug: string
    short_description: string | null
    description: string | null
    price: string | number | null
    mrp: string | number | null
    availability: (typeof availabilityValues)[number]
    status: 'ACTIVE' | 'INACTIVE'
    display_order: number
    created_at: string | Date
    updated_at: string | Date
    brand_name: string | null
    brand_slug: string | null
    primary_image_id: string | number | null
    primary_image_key: string | null
    primary_image_alt_text: string | null
}

export type CategoryRow = { id: string | number; name: string; slug: string }

export const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: paginationQueryProperties,
}

export const productProperties = {
    brandId: { type: ['integer', 'null'], minimum: 1 },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    slug: { type: 'string', minLength: 1, maxLength: 220 },
    shortDescription: { type: ['string', 'null'], maxLength: 500 },
    description: { type: ['string', 'null'] },
    price: { type: ['number', 'null'], minimum: 0 },
    mrp: { type: ['number', 'null'], minimum: 0 },
    availability: { type: 'string', enum: availabilityValues },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
    displayOrder: { type: 'integer', minimum: 0 },
}

export const createProductBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'slug'],
    properties: productProperties,
}

export const updateProductBodySchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: productProperties,
}

export type ProductBody = {
    brandId?: number | null
    name?: string
    slug?: string
    shortDescription?: string | null
    description?: string | null
    price?: number | null
    mrp?: number | null
    availability?: (typeof availabilityValues)[number]
    status?: 'ACTIVE' | 'INACTIVE'
    displayOrder?: number
}

export const productColumns: Partial<Record<keyof ProductBody, string>> = {
    brandId: 'brand_id',
    name: 'name',
    slug: 'slug',
    shortDescription: 'short_description',
    description: 'description',
    price: 'price',
    mrp: 'mrp',
    availability: 'availability',
    status: 'status',
    displayOrder: 'display_order',
}
