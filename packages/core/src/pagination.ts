/**
 * Paginación por cursor. Un SDK de producto describe cómo pedir una página y
 * el consumidor recorre los elementos con `for await`, sin manejar cursores.
 */
export type Page<T> = Readonly<{
    items: readonly T[];
    /** Cursor de la página siguiente; `null`/ausente cuando no hay más. */
    nextCursor?: string | null;
}>;

export type PageFetcher<T> = (cursor: string | undefined, signal?: AbortSignal) => Promise<Page<T>>;

export type PaginateOptions = Readonly<{
    /** Cursor inicial (reanudar un recorrido). */
    cursor?: string;
    /** Máximo de páginas a pedir (por defecto 10 000): un servidor que no avanza no cuelga al cliente. */
    maxPages?: number;
    signal?: AbortSignal;
}>;

/** Recorre página a página. Falla si un cursor se repite (el servidor no avanza). */
export async function* paginatePages<T>(fetchPage: PageFetcher<T>, options: PaginateOptions = {}): AsyncGenerator<Page<T>, void, undefined> {
    const maxPages = options.maxPages ?? 10_000;
    const seen = new Set<string>();
    let cursor = options.cursor;
    for (let pages = 0; pages < maxPages; pages += 1) {
        if (options.signal?.aborted) throw options.signal.reason;
        const page = await fetchPage(cursor, options.signal);
        yield page;
        const next = page.nextCursor;
        if (next === undefined || next === null || next === "") return;
        if (seen.has(next)) throw new Error("SDK_PAGINATION_CURSOR_REPEATED");
        seen.add(next);
        cursor = next;
    }
}

/** Recorre elemento a elemento. */
export async function* paginate<T>(fetchPage: PageFetcher<T>, options: PaginateOptions = {}): AsyncGenerator<T, void, undefined> {
    for await (const page of paginatePages(fetchPage, options)) yield* page.items;
}

/** Junta hasta `limit` elementos de un recorrido (por defecto todos). */
export async function collect<T>(items: AsyncIterable<T>, limit = Number.POSITIVE_INFINITY): Promise<T[]> {
    const out: T[] = [];
    if (limit <= 0) return out;
    for await (const item of items) {
        out.push(item);
        if (out.length >= limit) break;
    }
    return out;
}
