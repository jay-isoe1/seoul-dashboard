from flask import Flask, render_template, jsonify
from routes import bp as seoul_bp
import json
import os

app = Flask(__name__)

app.register_blueprint(seoul_bp)


@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
