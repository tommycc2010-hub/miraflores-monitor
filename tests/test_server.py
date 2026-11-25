import importlib

import pytest

TOKEN = "token-de-prueba"
VALID = {"tds": 120.5, "turbidez": 3.2, "ph": 7.1, "nivel": "ALTO"}


def load_app(monkeypatch, token):
    if token is None:
        monkeypatch.delenv("API_TOKEN", raising=False)
    else:
        monkeypatch.setenv("API_TOKEN", token)
    import server

    importlib.reload(server)
    server.app.config["TESTING"] = True
    return server.app.test_client()


@pytest.fixture
def client(monkeypatch):
    return load_app(monkeypatch, TOKEN)


def auth(token=TOKEN):
    return {"Authorization": f"Bearer {token}"}


def test_get_returns_initial_values(client):
    res = client.get("/datos")
    assert res.status_code == 200
    assert res.get_json() == {"tds": 0, "turbidez": 0, "ph": 7.0, "nivel": "BAJO"}


def test_index_serves_dashboard(client):
    res = client.get("/")
    assert res.status_code == 200
    assert b"Guardianes de Miraflores" in res.data


def test_post_without_token_is_rejected(client):
    res = client.post("/datos", json=VALID)
    assert res.status_code == 401
    assert client.get("/datos").get_json()["nivel"] == "BAJO"


def test_post_with_wrong_token_is_rejected(client):
    res = client.post("/datos", json=VALID, headers=auth("otro"))
    assert res.status_code == 401


def test_post_rejected_when_server_has_no_token(monkeypatch):
    c = load_app(monkeypatch, None)
    res = c.post("/datos", json=VALID, headers=auth())
    assert res.status_code == 503


def test_valid_post_updates_data(client):
    res = client.post("/datos", json=VALID, headers=auth())
    assert res.status_code == 200
    assert client.get("/datos").get_json() == VALID


def test_partial_post_keeps_previous_fields(client):
    client.post("/datos", json={"ph": 6.8}, headers=auth())
    assert client.get("/datos").get_json() == {"tds": 0, "turbidez": 0, "ph": 6.8, "nivel": "BAJO"}


def test_real_zero_readings_are_accepted(client):
    lectura = {"tds": 0, "conductividad": 0, "humedad": 0, "turbidez": 132.8, "ph": 7.62,
               "nivel": "ALTO", "temperatura": 25, "oxigeno": 8.34}
    res = client.post("/datos", json=lectura, headers=auth())
    assert res.status_code == 200
    assert client.get("/datos").get_json() == lectura


@pytest.mark.parametrize(
    "payload",
    [
        [1, 2, 3],
        "texto",
        {"tds": "<script>"},
        {"ph": 99},
        {"nivel": "<b>x</b>"},
        {"desconocido": 1},
        {"tds": True},
        {},
    ],
)
def test_invalid_payload_is_rejected(client, payload):
    res = client.post("/datos", json=payload, headers=auth())
    assert res.status_code == 400
    assert client.get("/datos").get_json()["tds"] == 0


def test_non_json_body_is_rejected(client):
    res = client.post("/datos", data="no json", headers=auth())
    assert res.status_code == 400
