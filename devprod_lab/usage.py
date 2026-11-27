"""Estimate Codespaces compute usage for a session."""

import argparse


def core_minutes(cores: int, active_minutes: int) -> int:
    """Return the estimated compute usage in core-minutes."""
    if cores < 1:
        raise ValueError("cores must be positive")
    if active_minutes < 0:
        raise ValueError("active minutes must be nonnegative")
    return cores * active_minutes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cores", type=int, help="machine core count")
    parser.add_argument("minutes", type=int, help="active session duration in minutes")
    args = parser.parse_args()
    try:
        usage = core_minutes(args.cores, args.minutes)
    except ValueError as error:
        parser.error(str(error))
    print(f"{usage} core-minutes ({usage / 60:.2f} core-hours)")


if __name__ == "__main__":
    main()
