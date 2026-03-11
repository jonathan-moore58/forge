/* ------------------------------------------------------------------ */
/*  API response types                                                 */
/* ------------------------------------------------------------------ */

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
}

export interface ApiResponse<T> {
    data: T;
    meta?: PaginationMeta;
}

/** Parse pagination query params with sane defaults */
export function parsePagination(query: Record<string, unknown>): { page: number; limit: number; offset: number } {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    return { page, limit, offset: (page - 1) * limit };
}
