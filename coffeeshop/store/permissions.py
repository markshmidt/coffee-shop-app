def compute_order_permissions(user, order=None):
    # Make sure we REALLY got a user
    if user is None or not hasattr(user, "has_perm"):
        raise ValueError("compute_order_permissions(): first argument must be a User")

    hp = user.has_perm  # shortcut

    perms = {
        "can_manage_customers": hp("store.manage_customers"),
        "can_manage_categories": hp("store.manage_categories"),
        "can_manage_menu_items": hp("store.manage_menu_items"),
        "can_manage_variants": hp("store.manage_variants"),

        "can_manage_modifier_groups": hp("store.manage_modifiers_groups"),
        "can_manage_modifiers": hp("store.manage_modifiers"),

        "can_view_sales_reports": hp("store.view_sales_reports"),

        "can_add_order": hp("store.add_order"),
        "can_change_order": hp("store.change_order"),
        "can_view_order": hp("store.view_order"),

        "can_apply_given_discount": hp("store.apply_given_discount"),
        "can_apply_any_discount": hp("store.apply_any_discount"),

        "can_void_order": hp("store.void_order"),
        "can_refund_order": hp("store.refund_order"),
    }

    # ORDER-SPECIFIC PERMS
    if order:
        st = order.status

        perms.update({
            "can_view": True,
            "can_print": True,
            "can_add_note": True,

            "can_change_status": st != "VOID",
            "can_assign_customer": st != "VOID" and hp("store.change_order"),
            "can_refund": (st == "COMPLETED") and hp("store.refund_order"),
            "can_void": st != "VOID" and hp("store.void_order"),
        })

    return perms


def is_manager(user):
    return (
        user.has_perm("store.manage_menu_items")
        or user.has_perm("store.view_sales_reports")
        or user.is_superuser
    )
