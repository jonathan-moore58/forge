/**
 * JSON replacer that converts BigInt values to strings.
 * Use: JSON.stringify(data, bigintReplacer)
 */
export function bigintReplacer(_key: string, value: unknown): unknown {
    return typeof value === 'bigint' ? value.toString() : value;
}
