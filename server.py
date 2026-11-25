"""Servidor del monitor de quebradas Guardianes de Miraflores.

GET  /datos  devuelve la ultima lectura recibida.
POST /datos  acepta una lectura del sensor. Requiere la cabecera
             ``Authorization: Bearer <API_TOKEN>``; el token se configura
             con la variable de entorno API_TOKEN (en Render: Environment).
"""

import hmac
import logging
import os
from typing import Any

from flask import Flask, Response, jsonify, request, send_file
from flask_cors import CORS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("miraflores")

app = Flask(__name__)
CORS(app)

API_TOKEN = os.environ.get("API_TOKEN", "")

NIVELES_VALIDOS = frozenset({"ALTO", "BAJO"})

# Rangos fisicamente posibles (min, max) para cada lectura numerica.
RANGOS_NUMERICOS: dict[str, tuple[float, float]] = {
    "tds": (0, 10000),
    "turbidez": (0, 5000),
    "ph": (0, 14),
    "temperatura": (-10, 60),
    "humedad": (0, 100),
    "conductividad": (0, 20000),
    "oxigeno": (0, 20),
}

CAMPOS_PERMITIDOS = frozenset(RANGOS_NUMERICOS) | {"nivel"}

datos: dict[str, Any] = {
    "tds": 0,
    "turbidez": 0,
    "ph": 7.0,
    "nivel": "BAJO",
}


def error(mensaje: str, status: int) -> tuple[Response, int]:
    return jsonify({"status": "error", "error": mensaje}), status


def token_valido(cabecera: str) -> bool:
    prefijo = "Bearer "
    if not cabecera.startswith(prefijo):
        return False
    return hmac.compare_digest(cabecera[len(prefijo):], API_TOKEN)


def validar_lectura(payload: Any) -> str | None:
    """Devuelve un mensaje de error, o None si la lectura es valida."""
    if not isinstance(payload, dict) or not payload:
        return "Se esperaba un objeto JSON con al menos un campo"

    desconocidos = set(payload) - CAMPOS_PERMITIDOS
    if desconocidos:
        return f"Campos no permitidos: {', '.join(sorted(desconocidos))}"

    for campo, valor in payload.items():
        if campo == "nivel":
            if valor not in NIVELES_VALIDOS:
                return "nivel debe ser ALTO o BAJO"
            continue
        if isinstance(valor, bool) or not isinstance(valor, (int, float)):
            return f"{campo} debe ser numerico"
        minimo, maximo = RANGOS_NUMERICOS[campo]
        if not minimo <= valor <= maximo:
            return f"{campo} fuera de rango ({minimo} a {maximo})"
    return None


@app.route("/")
def inicio() -> Response:
    return send_file("index.html")


@app.route("/datos", methods=["POST"])
def recibir_datos() -> tuple[Response, int]:
    global datos
    if not API_TOKEN:
        logger.error("POST /datos rechazado: API_TOKEN no esta configurado")
        return error("Servidor sin token configurado", 503)
    if not token_valido(request.headers.get("Authorization", "")):
        return error("No autorizado", 401)

    payload = request.get_json(silent=True)
    problema = validar_lectura(payload)
    if problema:
        return error(problema, 400)

    datos = {**datos, **payload}
    logger.info("Datos recibidos: %s", datos)
    return jsonify({"status": "ok"}), 200


@app.route("/datos", methods=["GET"])
def enviar_datos() -> Response:
    return jsonify(datos)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
