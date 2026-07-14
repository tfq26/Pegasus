from __future__ import annotations

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import (
    add_purchased_storage,
    add_purchased_tokens,
    get_user_payments,
    get_user_by_id,
    insert_payment,
    update_user_subscription,
)
from app.models import PaymentListResponse, StripeCheckoutRequest
from app.routes.auth import get_current_user

router = APIRouter(prefix="/billing", tags=["billing"])

stripe.api_key = settings.stripe_secret_key

# Price IDs for different products
PRICE_IDS = {
    "tokens_10000": {"tokens": 10000, "amount": 999},  # $9.99
    "tokens_50000": {"tokens": 50000, "amount": 3999},  # $39.99
    "storage_1gb": {"storage_bytes": 1073741824, "amount": 499},  # $4.99 for 1GB
    "storage_10gb": {"storage_bytes": 10737418240, "amount": 2999},  # $29.99 for 10GB
    "pro_monthly": {"tier": "pro", "amount": 2999},  # $29.99/mo
    "pro_plus_monthly": {"tier": "pro_plus", "amount": 9999},  # $99.99/mo
}


@router.post("/create-checkout-session")
async def create_checkout_session(req: StripeCheckoutRequest, user: dict = Depends(get_current_user)):
    """Create a Stripe Checkout Session for purchasing tokens, storage, or subscriptions."""
    price_config = PRICE_IDS.get(req.price_id)
    if not price_config:
        raise HTTPException(status_code=400, detail=f"Unknown price_id: {req.price_id}")

    success_url = req.success_url or f"{settings.frontend_url}/billing/success"
    cancel_url = req.cancel_url or f"{settings.frontend_url}/billing/cancel"

    try:
        session = stripe.checkout.Session.create(
            customer_email=user.get("email"),
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"Pegasus - {req.price_id}"},
                    "unit_amount": price_config["amount"],
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=cancel_url,
            metadata={
                "user_id": user["id"],
                "price_id": req.price_id,
                **{k: str(v) for k, v in price_config.items()},
            },
        )
        return {"url": session.url}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if settings.stripe_webhook_secret:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
        except stripe.error.SignatureVerificationError:
            return JSONResponse(status_code=400, content={"error": "Invalid signature"})
    else:
        # Development mode: parse without verification
        data = await request.json()
        event = {"type": data.get("type", ""), "data": {"object": data.get("data", {}).get("object", {})}}

    event_type = event["type"]
    session = event["data"]["object"]
    metadata = session.get("metadata", {})

    if event_type == "checkout.session.completed":
        user_id = metadata.get("user_id", "")
        price_id = metadata.get("price_id", "")

        if not user_id:
            return JSONResponse(status_code=200, content={"received": True})

        amount = session.get("amount_total", 0)
        stripe_session_id = session.get("id", "")
        stripe_payment_intent_id = session.get("payment_intent", "")

        await insert_payment(
            user_id=user_id,
            amount=amount,
            description=f"Purchase: {price_id}",
            status="succeeded",
            stripe_session_id=stripe_session_id,
            stripe_payment_intent_id=stripe_payment_intent_id,
        )

        # Apply add-ons
        if "tokens" in metadata:
            tokens = int(metadata["tokens"])
            await add_purchased_tokens(user_id, tokens)
        if "storage_bytes" in metadata:
            bytes_ = int(metadata["storage_bytes"])
            await add_purchased_storage(user_id, bytes_)
        if "tier" in metadata:
            await update_user_subscription(user_id, metadata["tier"])

    return JSONResponse(status_code=200, content={"received": True})


@router.get("/payments", response_model=PaymentListResponse)
async def list_payments(user: dict = Depends(get_current_user)):
    """Get payment history for the current user."""
    payments = await get_user_payments(user["id"])
    return PaymentListResponse(
        success=True,
        payments=payments,
    )


@router.get("/usage")
async def get_usage(user: dict = Depends(get_current_user)):
    """Get usage stats for the current user."""
    return {
        "tokens": 0,
        "limit": 60000,
        "tier": user.get("subscription_tier", "free"),
        "purchased_tokens": user.get("purchased_tokens", 0),
        "purchased_storage": user.get("purchased_storage", 0),
        "storage": 0,
        "storage_limit": 104857600,
    }
