import { hash, compare } from 'bcryptjs'
import type { Pool } from 'pg'
import type { UserRole, UserStatus, SafeUser, CreateUser, UpdateUser } from './user.schema.js'

type UserRow = {
    id: string | number
    tenant_id: string | number
    email: string
    first_name: string | null
    last_name: string | null
    tenant_role: UserRole
    status: UserStatus
    password_hash?: string
}

const columns = 'id, tenant_id, email, first_name, last_name, tenant_role, status'

function safeUser(row: UserRow): SafeUser {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        role: row.tenant_role,
        status: row.status,
    }
}

export class UserRepository {
    constructor(private readonly pool: Pick<Pool, 'query'>) {}

    async authenticate(
        tenantId: number,
        email: string,
        password: string,
    ): Promise<SafeUser | null> {
        const result = await this.pool.query<UserRow>(
            `SELECT ${columns}, password_hash FROM app_user
             WHERE tenant_id = $1 AND LOWER(email) = LOWER($2)
               AND user_type = 'TENANT_USER' AND status = 'ACTIVE'`,
            [tenantId, email],
        )
        const row = result.rows[0]
        if (!row?.password_hash || !(await compare(password, row.password_hash))) return null
        return safeUser(row)
    }

    async list(tenantId: number): Promise<SafeUser[]> {
        const result = await this.pool.query<UserRow>(
            `SELECT ${columns} FROM app_user WHERE tenant_id = $1
             AND user_type = 'TENANT_USER' ORDER BY id`,
            [tenantId],
        )
        return result.rows.map(safeUser)
    }

    async get(tenantId: number, id: number): Promise<SafeUser | null> {
        const result = await this.pool.query<UserRow>(
            `SELECT ${columns} FROM app_user WHERE tenant_id = $1
             AND id = $2 AND user_type = 'TENANT_USER'`,
            [tenantId, id],
        )
        return result.rows[0] ? safeUser(result.rows[0]) : null
    }

    async create(tenantId: number, input: CreateUser): Promise<SafeUser> {
        const passwordHash = await hash(input.password, 12)
        const result = await this.pool.query<UserRow>(
            `INSERT INTO app_user
             (tenant_id, email, password_hash, first_name, last_name, user_type, tenant_role)
             VALUES ($1, $2, $3, $4, $5, 'TENANT_USER', $6)
             RETURNING ${columns}`,
            [
                tenantId,
                input.email,
                passwordHash,
                input.firstName ?? null,
                input.lastName ?? null,
                input.role,
            ],
        )
        return safeUser(result.rows[0]!)
    }

    async update(tenantId: number, id: number, input: UpdateUser): Promise<SafeUser | null> {
        const fields: string[] = []
        const values: unknown[] = [tenantId, id]
        const add = (column: string, value: unknown) => {
            values.push(value)
            fields.push(`${column} = $${values.length}`)
        }
        if (input.email !== undefined) add('email', input.email)
        if (input.firstName !== undefined) add('first_name', input.firstName)
        if (input.lastName !== undefined) add('last_name', input.lastName)
        if (input.role !== undefined) add('tenant_role', input.role)
        if (input.status !== undefined) add('status', input.status)
        if (input.password !== undefined) add('password_hash', await hash(input.password, 12))
        const result = await this.pool.query<UserRow>(
            `UPDATE app_user SET ${fields.join(', ')} WHERE tenant_id = $1
             AND id = $2 AND user_type = 'TENANT_USER' RETURNING ${columns}`,
            values,
        )
        return result.rows[0] ? safeUser(result.rows[0]) : null
    }

    async delete(tenantId: number, id: number): Promise<boolean> {
        const result = await this.pool.query(
            `DELETE FROM app_user WHERE tenant_id = $1 AND id = $2
             AND user_type = 'TENANT_USER'`,
            [tenantId, id],
        )
        return (result.rowCount ?? 0) > 0
    }
}
