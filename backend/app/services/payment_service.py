from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.orm import Session, joinedload

from app.models import PaymentMatch, Transaction


@dataclass
class DetectionResult:
    matches_found: int
    total_matches: int


def detect_payments(db: Session) -> DetectionResult:
    """Detect credit card payments by matching BECU checking debits to Chase CC credits.

    BECU candidates: raw_description LIKE '%CHASE CREDIT CRD%' AND is_transfer = false
    Chase candidates: type = 'Payment' AND is_transfer = false

    Match criteria: amounts equal in magnitude, dates within 3 days.
    Idempotent: only considers is_transfer = false transactions.
    """
    becu_candidates = (
        db.query(Transaction)
        .filter(
            Transaction.raw_description.ilike("%CHASE CREDIT CRD%"),
            Transaction.is_transfer == False,  # noqa: E712
        )
        .all()
    )

    chase_candidates = (
        db.query(Transaction)
        .filter(
            Transaction.type == "Payment",
            Transaction.is_transfer == False,  # noqa: E712
        )
        .all()
    )

    matched_chase_ids: set[int] = set()
    matches_found = 0

    for becu_txn in becu_candidates:
        for chase_txn in chase_candidates:
            if chase_txn.id in matched_chase_ids:
                continue

            amounts_match = round(abs(becu_txn.amount), 2) == round(abs(chase_txn.amount), 2)
            dates_close = abs((becu_txn.date - chase_txn.date).days) <= 3

            if amounts_match and dates_close:
                becu_txn.is_transfer = True
                chase_txn.is_transfer = True

                match = PaymentMatch(
                    checking_transaction_id=becu_txn.id,
                    cc_transaction_id=chase_txn.id,
                )
                db.add(match)

                matched_chase_ids.add(chase_txn.id)
                matches_found += 1
                break

    db.commit()

    total_matches = db.query(PaymentMatch).count()
    return DetectionResult(matches_found=matches_found, total_matches=total_matches)


def list_matches(db: Session) -> list[PaymentMatch]:
    """List all payment matches with eagerly loaded transactions."""
    return (
        db.query(PaymentMatch)
        .options(
            joinedload(PaymentMatch.checking_transaction),
            joinedload(PaymentMatch.cc_transaction),
        )
        .order_by(PaymentMatch.matched_at.desc())
        .all()
    )


def unmatch(db: Session, match_id: int) -> PaymentMatch | None:
    """Remove a payment match and reset is_transfer on both transactions."""
    match = (
        db.query(PaymentMatch)
        .options(
            joinedload(PaymentMatch.checking_transaction),
            joinedload(PaymentMatch.cc_transaction),
        )
        .filter(PaymentMatch.id == match_id)
        .first()
    )
    if match is None:
        return None

    match.checking_transaction.is_transfer = False
    match.cc_transaction.is_transfer = False
    db.delete(match)
    db.commit()
    return match
