import { env } from '../../config/env.js'
import { allowedImageContentTypes } from '../../plugins/storage.js'

export type ImageRow = {
    id: string | number
    tenant_id: string | number
    product_id: string | number
    object_key: string
    alt_text: string | null
    is_primary: boolean
    display_order: number
    created_at: string | Date
}

export type UploadUrlBody = { filename?: string; contentType: string; size: number }

export type ImageBody = {
    objectKey?: string
    altText?: string | null
    isPrimary?: boolean
    displayOrder?: number
}

export const productIdParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['productId'],
    properties: { productId: { type: 'integer', minimum: 1 } },
}

export const productImageParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['productId', 'imageId'],
    properties: {
        productId: { type: 'integer', minimum: 1 },
        imageId: { type: 'integer', minimum: 1 },
    },
}

export const uploadUrlBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['contentType', 'size'],
    properties: {
        filename: { type: 'string', minLength: 1, maxLength: 255 },
        contentType: { type: 'string', enum: Object.keys(allowedImageContentTypes) },
        size: { type: 'integer', minimum: 1, maximum: env.r2.maxImageBytes },
    },
}

export const imageProperties = {
    objectKey: { type: 'string', minLength: 1, maxLength: 500 },
    altText: { type: ['string', 'null'], maxLength: 255 },
    isPrimary: { type: 'boolean' },
    displayOrder: { type: 'integer', minimum: 0 },
}

export const createImageBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['objectKey'],
    properties: imageProperties,
}

export const updateImageBodySchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: imageProperties,
}

export const imageColumns: Partial<Record<keyof ImageBody, string>> = {
    objectKey: 'object_key',
    altText: 'alt_text',
    isPrimary: 'is_primary',
    displayOrder: 'display_order',
}
