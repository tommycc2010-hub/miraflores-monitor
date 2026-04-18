from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

datos = {
    "tds": 0,
    "turbidez": 0,
    "ph": 7.0,
    "nivel": "BAJO"
}

@app.route("/")
def inicio():
    return send_file("index.html")

@app.route("/datos", methods=["POST"])
def recibir_datos():
    global datos
    datos = request.get_json()
    print(f"Datos recibidos: {datos}")
    return jsonify({"status": "ok"})

@app.route("/datos", methods=["GET"])
def enviar_datos():
    return jsonify(datos)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
