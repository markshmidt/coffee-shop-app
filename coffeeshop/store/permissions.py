

def compute_order_permissions(order, user):
    st = order.status

    hp = user.has_perm  # shortcut
    return {
        "can_view": True,
        "can_print": True,
        "can_add_note": True,
        "can_change_status": st != "VOID",
        "can_refund": (st == "COMPLETED") and hp("store.refund_order"),
        "can_assign_customer": st != "VOID" and hp("store.change_order"),
    }
