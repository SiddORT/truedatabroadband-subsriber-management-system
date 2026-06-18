from fastapi import APIRouter

from app.api.v1 import (
    activity,
    admin,
    auth,
    client,
    customers,
    dashboard,
    health,
    invoices,
    jobs,
    notifications,
    otp,
    payments,
    plans,
    reports,
    settings,
    subscription_requests,
    subscriptions,
    support,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(otp.router)
api_router.include_router(admin.router)
api_router.include_router(client.router)
api_router.include_router(customers.router)
api_router.include_router(plans.router)
api_router.include_router(subscriptions.router)
api_router.include_router(subscription_requests.router)
api_router.include_router(settings.router)
api_router.include_router(invoices.router)
api_router.include_router(payments.router)
api_router.include_router(dashboard.router)
api_router.include_router(reports.router)
api_router.include_router(notifications.router)
api_router.include_router(activity.router)
api_router.include_router(jobs.router)
api_router.include_router(support.router)
