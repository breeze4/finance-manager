from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    account_router,
    budget_router,
    category_router,
    coast_fire_router,
    csp_router,
    forecast_router,
    import_router,
    mortgage_router,
    net_income_router,
    payment_router,
    rules_router,
    snapshots_router,
    stats_router,
    subscription_router,
    transaction_router,
)

app = FastAPI(title="Finance Analyzer", version="0.1.0")
app.include_router(import_router.router)
app.include_router(transaction_router.router)
app.include_router(category_router.router)
app.include_router(stats_router.router)
app.include_router(rules_router.router)
app.include_router(payment_router.router)
app.include_router(subscription_router.router)
app.include_router(budget_router.router)
app.include_router(forecast_router.router)
app.include_router(coast_fire_router.router)
app.include_router(mortgage_router.router)
app.include_router(account_router.router)
app.include_router(snapshots_router.router)
app.include_router(net_income_router.router)
app.include_router(net_income_router.paycheck_router)
app.include_router(csp_router.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
