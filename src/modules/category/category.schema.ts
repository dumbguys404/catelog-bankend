import { paginationQueryProperties } from '../../utils/query.js'

export const statusSchema = { type: 'string', enum: ['ACTIVE', 'INACTIVE'] }
export const nullableString = { type: ['string', 'null'] }
export const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: paginationQueryProperties,
}
export const categoryProperties = {
    parentCategoryId: { type: ['integer', 'null'], minimum: 1 },
    name: { type: 'string', minLength: 1, maxLength: 150 },
    slug: { type: 'string', minLength: 1, maxLength: 160 },
    description: nullableString,
    imageKey: { type: ['string', 'null'], maxLength: 500 },
    displayOrder: { type: 'integer', minimum: 0 },
    status: statusSchema,
}
export const createBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'slug'],
    properties: categoryProperties,
}
export const updateBodySchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: categoryProperties,
}

export type CategoryBody = {
    parentCategoryId?: number | null
    name?: string
    slug?: string
    description?: string | null
    imageKey?: string | null
    displayOrder?: number
    status?: 'ACTIVE' | 'INACTIVE'
}
export const categoryColumns: Partial<Record<keyof CategoryBody, string>> = {
    parentCategoryId: 'parent_category_id',
    name: 'name',
    slug: 'slug',
    description: 'description',
    imageKey: 'image_key',
    displayOrder: 'display_order',
    status: 'status',
}

export type AdminCategoryRow = {
    id: string | number
    tenant_id: string | number
    parent_category_id: string | number | null
    name: string
    slug: string
    description: string | null
    image_key: string | null
    display_order: number
    status: 'ACTIVE' | 'INACTIVE'
    created_at: string | Date
    updated_at: string | Date
}

export type CatalogCategoryRow = {
    id: string | number
    parent_category_id: string | number | null
    name: string
    slug: string
    description: string | null
    image_key: string | null
    display_order: number
}
