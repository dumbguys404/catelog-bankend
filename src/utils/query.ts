export const collectionTypes = [
    'NEW_ARRIVAL',
    'TRENDING',
    'FESTIVAL',
    'FEATURED'
] as const

export const availabilityValues = [
    'AVAILABLE',
    'LIMITED',
    'OUT_OF_STOCK',
    'COMING_SOON'
] as const

export const sortValues = [
    'newest',
    'price_asc',
    'price_desc',
    'name_asc'
] as const

export type QueryRecord = Record<string, unknown>

export function parseNumberList(
    query: QueryRecord,
    key: string
): number[] | undefined {
    const value = query[key]

    if (typeof value !== 'string') {
        return undefined
    }

    return value
        .split(',')
        .map((item) => Number(item))
}

export function parseOptionalNumber(
    query: QueryRecord,
    key: string
): number | undefined {
    const value = query[key]

    if (typeof value !== 'number') {
        return undefined
    }

    return value
}

export function parseOptionalBoolean(
    query: QueryRecord,
    key: string
): boolean | undefined {
    const value = query[key]

    if (typeof value !== 'boolean') {
        return undefined
    }

    return value
}

export function parseString(
    query: QueryRecord,
    key: string
): string | undefined {
    const value = query[key]

    if (typeof value !== 'string') {
        return undefined
    }

    return value
}

export function parsePage(
    query: QueryRecord
): number {
    const value = query.page

    return typeof value === 'number' ? value : 1
}

export function parseLimit(
    query: QueryRecord
): number {
    const value = query.limit

    return typeof value === 'number' ? value : 24
}

export function omitUndefined<T extends Record<string, unknown>>(
    value: T
): Partial<T> {
    return Object.fromEntries(
        Object.entries(value).filter(([, item]) => item !== undefined)
    ) as Partial<T>
}

export const csvNumberListSchema = {
    type: 'string',
    pattern: '^\\d+(,\\d+)*$'
}

export const paginationQueryProperties = {
    page: {
        type: 'integer',
        minimum: 1
    },
    limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100
    }
}

export const idParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
        id: {
            type: 'integer',
            minimum: 1
        }
    }
}

export const emptyObjectBodySchema = {
    type: 'object',
    additionalProperties: true
}
