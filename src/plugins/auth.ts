import { createHash, timingSafeEqual } from 'node:crypto'

import type { FastifyReply, FastifyRequest } from 'fastify'

import { env } from '../config/env.js'

type BasicAuthCredentials = {
    username: string
    password: string
}

type ParsedBasicAuth = {
    username: string
    password: string
}

function hashText(value: string): Buffer {
    return createHash('sha256')
        .update(value)
        .digest()
}

function timingSafeTextEqual(
    actual: string,
    expected: string
): boolean {
    return timingSafeEqual(
        hashText(actual),
        hashText(expected)
    )
}

function parseBasicAuthHeader(
    authorizationHeader: string | undefined
): ParsedBasicAuth | null {
    if (!authorizationHeader) {
        return null
    }

    const [scheme, encodedCredentials, extra] =
        authorizationHeader.split(' ')

    if (
        scheme?.toLowerCase() !== 'basic' ||
        !encodedCredentials ||
        extra
    ) {
        return null
    }

    const decodedCredentials =
        Buffer.from(encodedCredentials, 'base64').toString('utf8')

    const separatorIndex =
        decodedCredentials.indexOf(':')

    if (separatorIndex < 0) {
        return null
    }

    return {
        username:
            decodedCredentials.slice(0, separatorIndex),

        password:
            decodedCredentials.slice(separatorIndex + 1)
    }
}

function isValidBasicAuth(
    parsedAuth: ParsedBasicAuth | null,
    credentials: BasicAuthCredentials
): boolean {
    if (!parsedAuth) {
        return false
    }

    return (
        timingSafeTextEqual(parsedAuth.username, credentials.username) &&
        timingSafeTextEqual(parsedAuth.password, credentials.password)
    )
}

function sendUnauthorized(reply: FastifyReply) {
    return reply
        .header('WWW-Authenticate', 'Basic realm="catalog-admin"')
        .code(401)
        .send({
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
        })
}

async function requireBasicAuth(
    request: FastifyRequest,
    reply: FastifyReply,
    credentials: BasicAuthCredentials
) {
    const parsedAuth =
        parseBasicAuthHeader(request.headers.authorization)

    if (!isValidBasicAuth(parsedAuth, credentials)) {
        return sendUnauthorized(reply)
    }
}

export async function requireTenantAdmin(
    request: FastifyRequest,
    reply: FastifyReply
) {
    return requireBasicAuth(
        request,
        reply,
        env.tenantAdmin
    )
}

export async function requirePlatformAdmin(
    request: FastifyRequest,
    reply: FastifyReply
) {
    return requireBasicAuth(
        request,
        reply,
        env.platformAdmin
    )
}
