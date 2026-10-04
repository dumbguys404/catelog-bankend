import { randomUUID } from 'node:crypto'
import {
    DeleteObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../config/env.js'

export const allowedImageContentTypes = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif'
} as const

export type AllowedImageContentType = keyof typeof allowedImageContentTypes

let client: S3Client | undefined

function getClient(): S3Client {
    const { accountId, accessKeyId, secretAccessKey, bucket } = env.r2
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
        throw Object.assign(new Error('R2 storage is not configured'), { statusCode: 503 })
    }
    client ??= new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey }
    })
    return client
}

export function isAllowedImageContentType(value: string): value is AllowedImageContentType {
    return value in allowedImageContentTypes
}

export function productImagePrefix(tenantId: number, productId: number): string {
    return `tenants/${tenantId}/products/${productId}/`
}

export function newProductImageKey(tenantId: number, productId: number, contentType: AllowedImageContentType): string {
    return `${productImagePrefix(tenantId, productId)}${randomUUID()}.${allowedImageContentTypes[contentType]}`
}

export function publicObjectUrl(objectKey: string): string | null {
    if (!env.r2.publicUrl) return null
    const encoded = objectKey.split('/').map(encodeURIComponent).join('/')
    return `${env.r2.publicUrl}/${encoded}`
}

export async function createProductImageUploadUrl(objectKey: string, contentType: AllowedImageContentType): Promise<string> {
    const s3 = getClient()
    return getSignedUrl(s3, new PutObjectCommand({
        Bucket: env.r2.bucket!, Key: objectKey, ContentType: contentType
    }), { expiresIn: env.r2.uploadUrlTtlSeconds })
}

export async function headObject(objectKey: string) {
    return getClient().send(new HeadObjectCommand({ Bucket: env.r2.bucket!, Key: objectKey }))
}

export async function deleteObject(objectKey: string): Promise<void> {
    await getClient().send(new DeleteObjectCommand({ Bucket: env.r2.bucket!, Key: objectKey }))
}
