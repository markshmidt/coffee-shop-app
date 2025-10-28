def serialize_customer(c):
    if not c:
        return None
    return {
        "id": c.id,
        "fname": c.fname,
        "lname": c.lname,
        "phone": c.phone,
        "email": c.email,
        "points_balance": c.points_balance,
        "can_redeem": c.can_redeem(),
    }