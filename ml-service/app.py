from flask import Flask, jsonify, request
from sklearn.preprocessing import MinMaxScaler

RISK_SCALER = MinMaxScaler(feature_range=(0, 100)).fit([[0.0], [100.0]])
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

def _number(value, minimum, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value < minimum or value > maximum:
        return None
    return float(value)


def _risk_for_student(student):
    signals = []

    readiness = _number(student.get("readiness"), 0, 100)
    if readiness is not None:
        signals.append(("Readiness", 0.30, 100 - readiness, f"{readiness:g}/100"))

    cgpa = _number(student.get("cgpa"), 0, 10)
    if cgpa is not None:
        signals.append(("Academic record", 0.10, (10 - cgpa) * 10, f"{cgpa:g}/10"))

    skill_gap = _number(student.get("skillGapPct"), 0, 100)
    if skill_gap is not None:
        signals.append(("Skill gaps", 0.25, skill_gap, f"{skill_gap:g}%"))

    backlogs = _number(student.get("backlogs"), 0, 100)
    if backlogs is not None:
        signals.append(("Backlogs", 0.15, min(backlogs, 5) * 20, f"{backlogs:g}"))

    applications = _number(student.get("applicationCount"), 0, 100000)
    if applications is not None:
        signals.append(("Application activity", 0.10, max(0, 100 - min(applications, 5) * 20), f"{applications:g} applications"))

    shortlisted = _number(student.get("shortlistedCount"), 0, 100000)
    if shortlisted is not None:
        signals.append(("Shortlisted applications", 0.10, 100 if shortlisted == 0 and (applications or 0) > 0 else 0,
                        f"{shortlisted:g} shortlisted"))

    interview = _number(student.get("interviewScore"), 0, 100)
    if interview is not None:
        signals.append(("Interview performance", 0.10, 100 - interview, f"{interview:g}/100"))

    if not signals:
        return {"studentId": student.get("studentId"), "riskLevel": None, "riskScore": None,
                "factors": [], "unavailableSignals": ["Readiness", "Academic record", "Skill gaps", "Backlogs", "Application activity", "Shortlisted applications", "Interview performance"]}

    weighted_score = 0.0
    weight_total = 0.0
    factors = []
    available_names = {item[0] for item in signals}
    for name, weight, raw_risk, value in signals:
        normalized_risk = float(RISK_SCALER.transform([[raw_risk]])[0][0])
        weighted_score += normalized_risk * weight
        weight_total += weight
        factors.append({"name": name, "value": value, "riskContribution": round(normalized_risk * weight, 1)})

    score = round(weighted_score / weight_total)
    level = "LOW" if score < 33 else "MEDIUM" if score < 66 else "HIGH"
    unavailable = [name for name in ["Readiness", "Academic record", "Skill gaps", "Backlogs", "Application activity", "Shortlisted applications", "Interview performance"] if name not in available_names]
    return {"studentId": student.get("studentId"), "riskLevel": level, "riskScore": score,
            "factors": sorted(factors, key=lambda item: item["riskContribution"], reverse=True),
            "unavailableSignals": unavailable}


@app.route('/predict-risk', methods=['POST'])
def predict_risk():
    payload = request.get_json(silent=True) or {}
    students = payload.get("students")
    if not isinstance(students, list) or len(students) > 5000 or any(not isinstance(student, dict) for student in students):
        return jsonify({"success": False, "error": {"code": "INVALID_INPUT", "message": "students must be an array of at most 5000 feature records"}}), 400
    predictions = [_risk_for_student(student) for student in students]
    return jsonify({"success": True, "data": {"predictions": predictions,
        "disclaimer": "Prototype predictive signal based on available placement data."}}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
