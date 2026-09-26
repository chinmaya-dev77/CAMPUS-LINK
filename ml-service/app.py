from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health_check():
    """
    GET /health
    Confirms the ML service is running.
    """
    return jsonify({
        "success": True,
        "data": {
            "status": "ok",
            "service": "campuslink-ml-service",
            "version": "1.0.0"
        },
        "message": "CampusLink ML Service is running"
    }), 200

# POST /predict-risk will be added in Phase 13

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
