from __future__ import annotations

import asyncpg
from app.config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


# ── User queries ──────────────────────────────────────────────────

async def get_user_by_email(email: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM pegasus_user WHERE email = $1", email
        )
    return dict(row) if row else None


async def get_user_by_id(user_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM pegasus_user WHERE id = $1", user_id
        )
    return dict(row) if row else None


async def upsert_user(
    user_id: str,
    email: str,
    first_name: str = "",
    last_name: str = "",
    profile_picture_url: str | None = None,
) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM pegasus_user WHERE email = $1", email
        )
        if existing:
            await conn.execute(
                """UPDATE pegasus_user
                   SET id = $1, first_name = $2, last_name = $3,
                       profile_picture_url = COALESCE($4, profile_picture_url),
                       updated_at = NOW()
                   WHERE email = $5""",
                user_id, first_name, last_name, profile_picture_url, email,
            )
            return dict(await conn.fetchrow("SELECT * FROM pegasus_user WHERE email = $1", email))
        else:
            await conn.execute(
                """INSERT INTO pegasus_user
                   (id, email, first_name, last_name, profile_picture_url,
                    subscription_tier, purchased_tokens, purchased_storage,
                    stripe_customer_id, updated_at)
                   VALUES ($1,$2,$3,$4,$5,'free',0,0,'',NOW())""",
                user_id, email, first_name, last_name, profile_picture_url,
            )
            return dict(await conn.fetchrow("SELECT * FROM pegasus_user WHERE id = $1", user_id))


async def update_user_subscription(user_id: str, tier: str, stripe_customer_id: str = "") -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE pegasus_user
               SET subscription_tier = $2,
                   stripe_customer_id = COALESCE(NULLIF($3, ''), stripe_customer_id),
                   updated_at = NOW()
               WHERE id = $1""",
            user_id, tier, stripe_customer_id,
        )


async def add_purchased_tokens(user_id: str, tokens: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE pegasus_user SET purchased_tokens = purchased_tokens + $2, updated_at = NOW() WHERE id = $1",
            user_id, tokens,
        )


async def add_purchased_storage(user_id: str, bytes_: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE pegasus_user SET purchased_storage = purchased_storage + $2, updated_at = NOW() WHERE id = $1",
            user_id, bytes_,
        )


# ── Device code queries ───────────────────────────────────────────

async def insert_device_code(device_code: str, user_code: str, expires_at) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO device_code (id, user_code, status, expires_at)
               VALUES ($1, $2, 'pending', $3)""",
            device_code, user_code, expires_at,
        )


async def get_device_code(device_code: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM device_code WHERE id = $1", device_code)
    return dict(row) if row else None


async def get_device_code_by_user_code(user_code: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM device_code WHERE user_code = $1 AND status = 'pending'", user_code
        )
    return dict(row) if row else None


async def authorize_device_code(device_code: str, access_token: str, user_data: dict) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE device_code SET status = 'authorized', access_token = $2, \"user\" = $3 WHERE id = $1",
            device_code, access_token, user_data,
        )


async def delete_device_code(code_id: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM device_code WHERE id = $1", code_id)


# ── Payment queries ────────────────────────────────────────────────

async def get_user_payments(user_id: str, limit: int = 50) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT * FROM user_payment
               WHERE user_id = $1
               ORDER BY created_at DESC
               LIMIT $2""",
            user_id, limit,
        )
    return [dict(r) for r in rows]


async def insert_payment(
    user_id: str,
    amount: int,
    description: str,
    status: str,
    stripe_session_id: str = "",
    stripe_payment_intent_id: str = "",
    tokens: int = 0,
    storage_bytes: int = 0,
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO user_payment
               (user_id, amount, currency, description, status,
                stripe_session_id, stripe_payment_intent_id,
                tokens, storage_bytes)
               VALUES ($1,$2,'usd',$3,$4,$5,$6,$7,$8)""",
            user_id, amount, description, status,
            stripe_session_id, stripe_payment_intent_id,
            tokens, storage_bytes,
        )
