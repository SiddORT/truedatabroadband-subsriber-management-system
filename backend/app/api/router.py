from fastapi import APIRouter

from app.api.v1 import admin, auth, client, customers, health, plans, settings, subscriptions

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(client.router)
api_router.include_router(customers.router)
api_router.include_router(plans.router)
api_router.include_router(subscriptions.router)
api_router.include_router(settings.router)
