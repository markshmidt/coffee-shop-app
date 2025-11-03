import json

from django.core.exceptions import BadRequest

def parse_json(request):
    # Ensure JSON content type
    ct = (request.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if ct != "application/json":
        raise BadRequest("Expected Content-Type: application/json")

    # Read body once and decode
    try:
        body = request.body.decode("utf-8")  # request.body is bytes that we convert to a string using UTF-8
    except UnicodeDecodeError:
        raise BadRequest("Body must be UTF-8 encoded")

    # Parse JSON string into python obj
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        raise BadRequest("Invalid JSON")
