from fastapi import APIRouter

from app.api.v1 import admin, auth, client, customers, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(client.router)
api_router.include_router(customers.router)
