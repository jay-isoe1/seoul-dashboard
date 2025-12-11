import json
from flask import Blueprint, jsonify, request
import os


bp = Blueprint('seoul', __name__)

with open("seoul_all_cleaned.json", encoding='utf-8') as f:
    SEOUL_DATA = json.load(f)
    
    
@bp.route('/seoul/crime')
def seoul_crime():
    return jsonify(SEOUL_DATA)