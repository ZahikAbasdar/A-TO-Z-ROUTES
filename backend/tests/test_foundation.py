import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac


@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_all_route_stubs_respond(client):
    routes = [
        "/api/v1/auth/ping",
        "/api/v1/shipments/ping",
        "/api/v1/tracking/ping",
        "/api/v1/drivers/ping",
        "/api/v1/analytics/ping",
        "/api/v1/notifications/ping",
        "/api/v1/admin/ping",
    ]
    for route in routes:
        response = await client.get(route)
        assert response.status_code == 200, f"Route {route} failed"
