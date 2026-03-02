import { describe, it, expect, mock, beforeAll, afterAll } from "bun:test"
import { SQLiteAdapter } from "../adapters/sqliteAdapter.js"

// Mock global fetch
const originalFetch = global.fetch
const mockFetch = mock((url, options) => {
    // Simulate Turso API response
    if (url.includes("/v2/pipeline")) {
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                results: [{
                    type: "ok",
                    response: {
                        result: {
                            cols: [{ name: "id" }, { name: "name" }],
                            rows: [
                                [{ type: "integer", value: "1" }, { type: "text", value: "Alice" }]
                            ],
                            affected_row_count: 0,
                            last_insert_rowid: null
                        }
                    }
                }]
            }),
            text: () => Promise.resolve("")
        })
    }
    return Promise.reject(new Error("Unknown URL"))
})

describe("SQLiteAdapter", () => {
    beforeAll(() => {
        global.fetch = mockFetch
    })

    afterAll(() => {
        global.fetch = originalFetch
    })

    it("should detect remote Turso URL and use CustomFetchClient", async () => {
        const adapter = new SQLiteAdapter({
            id: "test",
            provider: "sqlite",
            path: "https://test-db.turso.io",
            authToken: "test-token"
        })

        await adapter.connect()

        // Check if internal db is our CustomFetchClient
        expect(adapter.db.constructor.name).toBe("CustomFetchClient")
        expect(adapter.db.url).toBe("https://test-db.turso.io")
        expect(adapter.db.authToken).toBe("test-token")
    })

    it("should execute query against Turso using fetch", async () => {
        const adapter = new SQLiteAdapter({
            id: "test",
            provider: "sqlite",
            path: "https://test-db.turso.io",
            authToken: "test-token"
        })

        await adapter.connect()
        const results = await adapter.query("SELECT * FROM users")

        // Verify results are parsed correctly
        expect(results).toHaveLength(1)
        expect(results[0]).toEqual({ id: 1, name: "Alice" })

        // Verify fetch was called correctly
        expect(mockFetch).toHaveBeenCalled()
        const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
        const [url, options] = lastCall

        expect(url).toContain("/v2/pipeline")
        expect(options.method).toBe("POST")
        expect(options.headers["Authorization"]).toBe("Bearer test-token")

        const body = JSON.parse(options.body)
        expect(body.requests[0].stmt.sql).toBe("SELECT * FROM users")
    })

    it("should convert named arguments to positional for Turso", async () => {
        const adapter = new SQLiteAdapter({
            id: "test",
            provider: "sqlite",
            path: "https://test-db.turso.io",
            authToken: "test-token"
        })

        await adapter.connect()

        // We need to access the private db object to test execute directly 
        // because adapter.query doesn't expose args easily in the current interface
        // But we can verify the mock call

        await adapter.db.execute({
            sql: "SELECT * FROM users WHERE id = $id",
            args: { id: 123 }
        })

        const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
        const body = JSON.parse(lastCall[1].body)

        // Should be converted to ?
        expect(body.requests[0].stmt.sql).toContain("id = ?")
        // Args should be array
        expect(body.requests[0].stmt.args).toHaveLength(1)
        expect(body.requests[0].stmt.args[0].value).toBe(123)
    })
})
