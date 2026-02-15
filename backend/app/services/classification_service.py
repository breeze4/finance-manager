from sqlalchemy.orm import Session

from app.models import ClassificationRule, Transaction


def find_matching_rule(db: Session, vendor: str) -> ClassificationRule | None:
    """Find the best matching classification rule for a vendor.

    Precedence: exact > starts_with > contains, each ordered by priority desc.
    """
    vendor_lower = vendor.lower()

    rules = db.query(ClassificationRule).order_by(ClassificationRule.priority.desc()).all()

    best_exact = None
    best_starts = None
    best_contains = None

    for rule in rules:
        pattern_lower = rule.vendor_pattern.lower()

        if rule.match_type == "exact" and vendor_lower == pattern_lower:
            if best_exact is None or rule.priority > best_exact.priority:
                best_exact = rule
        elif rule.match_type == "starts_with" and vendor_lower.startswith(pattern_lower):
            if best_starts is None or rule.priority > best_starts.priority:
                best_starts = rule
        elif rule.match_type == "contains" and pattern_lower in vendor_lower:
            if best_contains is None or rule.priority > best_contains.priority:
                best_contains = rule

    return best_exact or best_starts or best_contains


def auto_create_rule(
    db: Session,
    vendor: str,
    category_id: int,
    vendor_display_name: str | None = None,
) -> ClassificationRule:
    """Create or update an exact-match rule for a vendor.

    If an exact rule for this vendor already exists, update it.
    Otherwise create a new one.
    """
    existing = (
        db.query(ClassificationRule)
        .filter(
            ClassificationRule.vendor_pattern.ilike(vendor),
            ClassificationRule.match_type == "exact",
        )
        .first()
    )

    if existing:
        existing.category_id = category_id
        if vendor_display_name is not None:
            existing.vendor_display_name = vendor_display_name
        db.flush()
        return existing

    rule = ClassificationRule(
        vendor_pattern=vendor,
        match_type="exact",
        category_id=category_id,
        vendor_display_name=vendor_display_name,
    )
    db.add(rule)
    db.flush()
    return rule


def apply_rule(db: Session, rule: ClassificationRule) -> int:
    """Apply a single rule to all matching unverified transactions.

    Returns count of updated transactions.
    """
    query = db.query(Transaction).filter(Transaction.is_verified.is_(False))

    if rule.match_type == "exact":
        query = query.filter(Transaction.vendor.ilike(rule.vendor_pattern))
    elif rule.match_type == "starts_with":
        query = query.filter(Transaction.vendor.ilike(f"{rule.vendor_pattern}%"))
    elif rule.match_type == "contains":
        query = query.filter(Transaction.vendor.ilike(f"%{rule.vendor_pattern}%"))
    else:
        return 0

    updates: dict = {}
    if rule.category_id is not None:
        updates["category_id"] = rule.category_id

    if not updates:
        return 0

    count = query.update(updates, synchronize_session="fetch")
    db.flush()
    return count


def apply_all_rules(db: Session) -> int:
    """Apply all rules to unverified transactions. Returns total updated count."""
    rules = db.query(ClassificationRule).order_by(ClassificationRule.priority.desc()).all()
    total = 0
    for rule in rules:
        total += apply_rule(db, rule)
    db.commit()
    return total
