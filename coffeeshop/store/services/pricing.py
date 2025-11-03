# 13% -> 1300 basis points; return integer cents
from decimal import Decimal


def _bp(amount_cents: int, bp: int) -> int:
    """
    Compute a percentage-based amount using basis points (1 bp = 0.01%).

    Parameters
    ----------
    amount_cents : int
        Base amount in cents (integer subunits of a dollar).
    bp : int
        Rate in basis points, e.g. 1300 for 13.00%.

    Returns
    -------
    int
        The computed amount in cents, rounded to the nearest cent
     """
    return round(amount_cents * bp / 10_000)

# round to nearest $0.05 for CASH only
def _nickel_round_cents(cents: int) -> int:
    return int(round(cents / 5.0) * 5)


def _fmt_cents(c):
    return f"${(Decimal(c) / Decimal(100)).quantize(Decimal('0.00'))}"
