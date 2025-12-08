from flask import Flask, render_template, jsonify
import json
import os

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/seoul/crime")
def seoul_crime():
    # static/data/crime.json 경로
    data_path = os.path.join(app.static_folder, "data", "crime.json")

    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)

    return jsonify(data)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
