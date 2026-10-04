export type UserRole = 'OWNER' | 'ADMIN' | 'EDITOR'
export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED'

export type SafeUser = {
    id: number
    tenantId: number
    email: string
    firstName: string | null
    lastName: string | null
    role: UserRole
    status: UserStatus
}

export type CreateUser = {
    email: string
    password: string
    firstName?: string
    lastName?: string
    role: UserRole
}

export type UpdateUser = {
    email?: string
    password?: string
    firstName?: string | null
    lastName?: string | null
    role?: UserRole
    status?: UserStatus
}

const email = {
    type: 'string',
    minLength: 3,
    maxLength: 255,
    pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
}
const name = { type: 'string', minLength: 1, maxLength: 100 }
const password = { type: 'string', minLength: 8, maxLength: 256 }
const role = { type: 'string', enum: ['OWNER', 'ADMIN', 'EDITOR'] }

export const createSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['email', 'password', 'role'],
    properties: { email, password, firstName: name, lastName: name, role },
}

export const updateSchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
        email,
        password,
        firstName: { type: ['string', 'null'], maxLength: 100 },
        lastName: { type: ['string', 'null'], maxLength: 100 },
        role,
        status: { type: 'string', enum: ['ACTIVE', 'LOCKED', 'DISABLED'] },
    },
}
