import pytest


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_chat_empty_message(client):
    response = await client.post("/api/v1/chat", json={"message": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_profiles_me_requires_auth(client):
    response = await client.get("/api/v1/profiles/me")
    assert response.status_code == 401
