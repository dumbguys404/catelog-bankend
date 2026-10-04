/** Build SET clauses from a fixed map of accepted request fields to database columns. */
export function buildUpdate<T extends object>(
    body: T,
    columns: Partial<Record<keyof T, string>>,
    scopeValues: unknown[],
): { assignments: string; values: unknown[] } {
    const values = [...scopeValues]
    const assignments: string[] = []

    for (const [field, column] of Object.entries(columns)) {
        const value = body[field as keyof T]
        if (value === undefined) continue

        values.push(value)
        assignments.push(`${column} = $${values.length}`)
    }

    return { assignments: assignments.join(', '), values }
}
