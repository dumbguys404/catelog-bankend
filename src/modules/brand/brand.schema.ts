import { paginationQueryProperties } from '../../utils/query.js'

export const statusSchema = { type: 'string', enum: ['ACTIVE', 'INACTIVE'] }
export const brandProperties = {
    name: { type: 'string', minLength: 1, maxLength: 150 },
    slug: { type: 'string', minLength: 1, maxLength: 160 },
    description: { type: ['string', 'null'] },
    logoKey: { type: ['string', 'null'], maxLength: 500 },
    websiteUrl: { type: ['string', 'null'], maxLength: 500 },
    displayOrder: { type: 'integer', minimum: 0 },
    status: statusSchema,
}
export const createBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'slug'],
    properties: brandProperties,
}
export const updateBodySchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: brandProperties,
}
export const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: paginationQueryProperties,
}

export type BrandBody = {
    name?: string
    slug?: string
    description?: string | null
    logoKey?: string | null
    websiteUrl?: string | null
    displayOrder?: number
    status?: 'ACTIVE' | 'INACTIVE'
}
export const brandColumns: Partial<Record<keyof BrandBody, string>> = {
    name: 'name',
    slug: 'slug',
    description: 'description',
    logoKey: 'logo_key',
    websiteUrl: 'website_url',
    displayOrder: 'display_order',
    status: 'status',
}

export type AdminBrandRow = {
    id: string | number
    tenant_id: string | number
    name: string
    slug: string
    description: string | null
    logo_key: string | null
    website_url: string | null
    display_order: number
    status: 'ACTIVE' | 'INACTIVE'
    created_at: string | Date
    updated_at: string | Date
}

export type CatalogBrandRow = {
    id: string | number
    name: string
    slug: string
    description: string | null
    logo_key: string | null
    website_url: string | null
    display_order: number
}
