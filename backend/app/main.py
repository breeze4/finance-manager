from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

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

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

app = FastAPI(title="Finance Manager", version="0.1.0")
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


# Serve built frontend (only present in deployed/built environments).
if FRONTEND_DIR.is_dir():
    assets_dir = FRONTEND_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = FRONTEND_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIR / "index.html")


# Outer app used in production: mounts the inner app at /finance.
# Uvicorn target: app.main:mounted_app
mounted_app = FastAPI()


@mounted_app.get("/finance")
async def _redirect_to_trailing_slash():
    return RedirectResponse(url="/finance/")


mounted_app.mount("/finance", app)
