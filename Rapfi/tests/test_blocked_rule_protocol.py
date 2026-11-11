#!/usr/bin/env python3
"""Black-box regression tests for YXCAROBLOCKED using TRACEBOARD Pattern4 output."""
import subprocess
import sys

ENGINE = sys.argv[1] if len(sys.argv) > 1 else "../Rapfi/build-caro-fast/pbrain-rapfi"

CASES = [
    # Four black stones H8-K8; G8 and M8 are white: L8 would make a blocked exact five.
    ("exact five blocked by opponent", "YXBOARD 7,7,1 6,7,2 8,7,1 12,7,2 9,7,1 0,0,2 10,7,1 1,0,2 DONE", 11, 7, False, True),
    # Only G8 is blocked; M8 is open, so L8 completes a winning five.
    ("exact five with one open end", "YXBOARD 7,7,1 6,7,2 8,7,1 0,0,2 9,7,1 1,0,2 10,7,1 DONE", 11, 7, True, True),
    # WALL at both endpoints is equivalent to two blockers.
    ("exact five blocked by WALL", "YXBOARD 7,7,1 6,7,3 8,7,1 12,7,3 9,7,1 0,0,2 10,7,1 DONE", 11, 7, False, False),
    # Five existing stones H8-L8; playing M8 creates six, which still wins despite walls G8/N8.
    ("six in a row despite WALL endpoints", "YXBOARD 7,7,1 6,7,3 8,7,1 13,7,3 9,7,1 0,0,2 10,7,1 1,0,2 11,7,1 DONE", 12, 7, True, False),
    # Playing A8 makes exactly five A8-E8; left board edge and F8 are both blocked.
    ("exact five at edge with opposite endpoint blocked", "YXBOARD 1,7,1 5,7,2 2,7,1 0,0,2 3,7,1 1,0,2 4,7,1 DONE", 0, 7, True, True),
    # Same edge run, but F8 is open: at least one endpoint is open, so it wins.
    ("exact five with edge and open opposite end", "YXBOARD 1,7,1 0,0,2 2,7,1 1,0,2 3,7,1 2,0,2 4,7,1 DONE", 0, 7, True, True),
    # Diagonal five through H8, with both diagonal endpoints occupied by White.
    ("diagonal exact five blocked by opponent", "YXBOARD 5,5,1 4,4,2 6,6,1 0,0,2 8,8,1 10,10,2 9,9,1 1,0,2 DONE", 7, 7, False, True),
]

def black_pattern4_row(output, y):
    lines = output.splitlines()
    header = next(i for i, line in enumerate(lines) if "Pattern4----Black" in line)
    row = lines[header + y + 1].replace("MESSAGE", "", 1).strip().split()
    return row

for name, position, x, y, expected, no_walls in CASES:
    command = f"YXCAROBLOCKED 1\nSTART 15\n{position}\nTRACEBOARD\n"
    proc = subprocess.run([ENGINE], input=command, text=True, capture_output=True, timeout=60)
    output = proc.stdout + proc.stderr
    if proc.returncode != 0 or "ERROR" in output:
        raise SystemExit(f"FAIL {name}: engine error\n{output[-2000:]}")
    row = black_pattern4_row(output, y)
    actual = (row[x] == "A") if no_walls else ("A" in row)
    if actual != expected:
        raise SystemExit(f"FAIL {name}: expected A_FIVE={expected}, row={row!r}\n{output[-2000:]}")
    print(f"PASS {name}")

print(f"PASS all {len(CASES)} blocked-Caro protocol cases")

# Explicitly disabling the experimental mode must preserve original Freestyle behavior.
freestyle_position = "YXBOARD 7,7,1 6,7,2 8,7,1 12,7,2 9,7,1 0,0,2 10,7,1 1,0,2 DONE"
command = f"YXCAROBLOCKED 0\nSTART 15\n{freestyle_position}\nTRACEBOARD\n"
proc = subprocess.run([ENGINE], input=command, text=True, capture_output=True, timeout=60)
output = proc.stdout + proc.stderr
row = black_pattern4_row(output, 7)
if "A" not in row:
    raise SystemExit("FAIL Freestyle compatibility: blocked exact five should remain A_FIVE when mode is off")
print("PASS Freestyle unchanged when mode is off")

# Incremental update: after B8-E8 exist, playing F8 must update A8 (five cells away)
# as a winning continuation because A8-F8 would be six in a row. TURN also exercises
# the search's speculative move/undo path with the wider affected-cell window.
incremental = (
    "YXCAROBLOCKED 1\nSTART 15\n"
    "YXBOARD 1,7,1 0,0,2 2,7,1 1,0,2 3,7,1 2,0,2 4,7,1 3,0,2 DONE\n"
    "INFO MAX_NODE 1\nTURN 5,7\nYXSTOP\nTRACEBOARD\n"
)
proc = subprocess.run([ENGINE], input=incremental, text=True, capture_output=True, timeout=60)
output = proc.stdout + proc.stderr
if proc.returncode != 0 or "Assertion" in output or "ERROR" in output:
    raise SystemExit(f"FAIL incremental six-in-a-row update/search-undo\n{output[-2000:]}")
row = black_pattern4_row(output, 7)
if row[0] != "A":
    raise SystemExit(f"FAIL incremental six-in-a-row: expected A8 to be A_FIVE, row={row!r}")
print("PASS incremental six-in-a-row update and search undo")

# Selecting Standard must continue to use Rapfi's original Standard tables even if the
# experimental flag is still set globally.
standard_smoke = (
    "INFO RULE 1\nYXCAROBLOCKED 1\nSTART 15\n"
    "YXBOARD 7,7,1 6,7,2 8,7,1 5,7,2 DONE\nTRACEBOARD\n"
)
proc = subprocess.run([ENGINE], input=standard_smoke, text=True, capture_output=True, timeout=60)
output = proc.stdout + proc.stderr
if proc.returncode != 0 or "Assertion" in output or "ERROR" in output:
    raise SystemExit(f"FAIL Standard-rule isolation\n{output[-2000:]}")
print("PASS Standard rule remains isolated")
