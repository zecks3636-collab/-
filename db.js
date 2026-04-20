/**
 * db.js — Supabase 클라이언트 호환 API 레이어
 * Supabase → 사내 PostgreSQL (FastAPI 백엔드 경유)
 */

(function () {
    const BASE = '/api';

    async function req(method, path, body) {
        const res = await fetch(BASE + path, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            const msg = await res.text().catch(() => res.statusText);
            return { data: null, error: { message: msg } };
        }
        const data = await res.json().catch(() => null);
        return { data, error: null };
    }

    // ── 테이블별 API 매핑 ──
    const TABLE_MAP = {
        schedules:        '/schedules',
        leave_plans:      '/leave_plans',
        request_schedules:'/request_schedules',
        event_colors:     '/event_colors',
        menu_weeks:       '/menu_weeks',
        request_months:   '/request_months',
    };

    function from(tableName) {
        const path = TABLE_MAP[tableName] || '/' + tableName;

        return {
            // SELECT
            select(cols) {
                return {
                    order() { return req('GET', path); },
                    eq(col, val) { return req('GET', `${path}?${col}=eq.${encodeURIComponent(val)}`); },
                    gte(col, val) { return req('GET', `${path}?${col}=gte.${encodeURIComponent(val)}`); },
                    then(resolve, reject) { return req('GET', path).then(resolve, reject); },
                };
            },
            // INSERT
            insert(payload) {
                const items = Array.isArray(payload) ? payload : [payload];
                return req('POST', path, items).then(r => ({
                    data: r.data,
                    error: r.error,
                    select() { return Promise.resolve(r); },
                    single() { return Promise.resolve(r); },
                }));
            },
            // UPSERT
            upsert(payload, opts) {
                const items = Array.isArray(payload) ? payload : [payload];
                return req('POST', `${path}/upsert`, items);
            },
            // UPDATE
            update(payload) {
                return {
                    eq(col, val) {
                        return req('PUT', `${path}/${encodeURIComponent(val)}`, payload);
                    }
                };
            },
            // DELETE
            delete() {
                return {
                    eq(col, val) {
                        return req('DELETE', `${path}/${encodeURIComponent(val)}`);
                    },
                    in(col, vals) {
                        return req('POST', `${path}/delete`, vals);
                    }
                };
            },
        };
    }

    // ── Storage 호환 (menu-images → /api/storage/menu-images) ──
    const storage = {
        from(bucket) {
            return {
                async upload(path, blob, opts) {
                    const form = new FormData();
                    form.append('file', blob, path);
                    const res = await fetch(`${BASE}/storage/${bucket}/${path}`, {
                        method: 'POST', body: form
                    });
                    return res.ok ? { error: null } : { error: { message: await res.text() } };
                },
                getPublicUrl(path) {
                    return { data: { publicUrl: `${BASE}/storage/${bucket}/${path}` } };
                },
                async remove(paths) {
                    for (const p of paths) {
                        await fetch(`${BASE}/storage/${bucket}/${p}`, { method: 'DELETE' });
                    }
                    return { error: null };
                }
            };
        }
    };

    // ── 전역 노출 ──
    window.__dbClient = { from, storage };
})();
