import { paginationQueryProperties } from '../../utils/query.js'

export const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: paginationQueryProperties,
}
export const tenantProperties = {
    code: { type: 'string', minLength: 1, maxLength: 50, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
    name: { type: 'string', minLength: 1, maxLength: 150 },
    domain: { type: ['string', 'null'], maxLength: 255, pattern: '^[A-Za-z0-9.-]+$' },
    status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'INACTIVE'] },
}
export const createBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'name'],
    properties: tenantProperties,
}
export const updateBodySchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: tenantProperties,
}
export type TenantBody = {
    code?: string
    name?: string
    domain?: string | null
    status?: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE'
}
export const tenantColumns: Partial<Record<keyof TenantBody, string>> = {
    code: 'code',
    name: 'name',
    domain: 'domain',
    status: 'status',
}

export type TenantRow = {
    id: string | number
    code: string
    name: string
    domain: string | null
    status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE'
    created_at: string | Date
    updated_at: string | Date
}
