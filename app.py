from flask import Flask, render_template
from pymongo import MongoClient
import json
from bson import json_util
from bson.json_util import dumps


app = Flask(__name__)

MONGODB_HOST = 'localhost'
MONGODB_PORT = 27017
DBS_NAME = 'seoul'
COLLECTION_NAME = 'crime'

FIELDS = {
    'region_id': True,
    'region_name': True,
    'year': True,
    'crime_rate': True,
    'pop': True,
    'park_area': True,
    'gdp': True,
    '_id': False
}

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/seoul/crime")
def seoul_crime():
    connection = MongoClient(MONGODB_HOST, MONGODB_PORT)
    collection = connection[DBS_NAME][COLLECTION_NAME]
    
    records = collection.find(projection=FIELDS)
    json_records = json.dumps(list(records), default=json_util.default)
    
    connection.close()
    return json_records

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)

