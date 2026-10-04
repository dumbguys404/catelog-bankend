type UploadImageOptions = {
    apiBaseUrl: string
    productId: number
    file: File
    authorization: string
    altText?: string
    isPrimary?: boolean
    displayOrder?: number
}

export async function uploadProductImage(options: UploadImageOptions) {
    const { apiBaseUrl, productId, file, authorization } = options
    const presignResponse = await fetch(`${apiBaseUrl}/api/admin/products/${productId}/images/upload-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization },
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size })
    })
    if (!presignResponse.ok) throw new Error(`Could not create upload URL: ${presignResponse.status}`)
    const presign = await presignResponse.json() as { data: { uploadUrl: string; objectKey: string; requiredHeaders: Record<string,string> } }
    const uploadResponse = await fetch(presign.data.uploadUrl, {
        method: 'PUT', headers: presign.data.requiredHeaders, body: file
    })
    if (!uploadResponse.ok) throw new Error(`R2 upload failed: ${uploadResponse.status}`)
    const completeResponse = await fetch(`${apiBaseUrl}/api/admin/products/${productId}/images/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization },
        body: JSON.stringify({ objectKey: presign.data.objectKey, altText: options.altText ?? null,
            isPrimary: options.isPrimary, displayOrder: options.displayOrder ?? 0 })
    })
    if (!completeResponse.ok) throw new Error(`Could not register uploaded image: ${completeResponse.status}`)
    return completeResponse.json()
}
