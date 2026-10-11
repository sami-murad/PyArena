"""Builds ``questions.json`` from the definitions below.

Expected outputs are computed by running each reference solution, so the
answer key can never drift from the tests.  Run from the repository root:

    python database/seeds/build_questions.py

All questions are original to PyArena.  The JSON file contains hidden tests
and reference solutions: in a public deployment keep the production question
bank private (see docs/SECURITY.md).
"""

from __future__ import annotations

import io
import json
import textwrap
from contextlib import redirect_stdout
from pathlib import Path
from typing import Any

QUESTIONS: list[dict[str, Any]] = [
    {
        "slug": "pair-to-target",
        "title": "Pair to target",
        "difficulty": "easy",
        "mode": "function",
        "function_name": "pair_to_target",
        "signature": "def pair_to_target(nums: list[int], target: int) -> list[int]:",
        "statement": (
            "Given a list of integers `nums` and an integer `target`, return the indices of the two "
            "different positions whose values add up to `target`.\n\n"
            "Return the two indices as a list `[i, j]` with `i < j`. Exactly one valid pair exists."
        ),
        "input_spec": "`nums`: list of integers. `target`: integer.",
        "output_spec": "A list of two indices `[i, j]` with `i < j`.",
        "constraints": ["2 <= len(nums) <= 10^4", "-10^9 <= nums[i], target <= 10^9", "Exactly one answer exists"],
        "starter_code": "def pair_to_target(nums, target):\n    # Return [i, j] with i < j and nums[i] + nums[j] == target\n    pass\n",
        "explanation": "Walk the list once and remember each value's index in a dictionary. For each number, check whether `target - number` has already been seen. This runs in O(n) time.",
        "reference": """
def pair_to_target(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
""",
        "tests": [
            {"input": [[3, 8, 11, 5], 13], "public": True, "note": "8 + 5 = 13"},
            {"input": [[4, 4], 8], "public": True},
            {"input": [[-3, 7, 1, 10], 7]},
            {"input": [[0, 5, -5, 9], 0]},
            {"input": [[1, 2, 3, 4, 5, 6, 7, 8, 9, 1000], 1009]},
            {"input": [[1000000000, -999999997, 5], 3]},
            {"input": [list(range(0, 20000, 2)), 39994]},
        ],
    },
    {
        "slug": "count-vowels",
        "title": "Count the vowels",
        "difficulty": "easy",
        "mode": "function",
        "function_name": "count_vowels",
        "signature": "def count_vowels(text: str) -> int:",
        "statement": "Return how many vowels (`a`, `e`, `i`, `o`, `u`, in either case) appear in `text`.",
        "input_spec": "`text`: a string that may contain letters, digits, spaces and punctuation.",
        "output_spec": "An integer.",
        "constraints": ["0 <= len(text) <= 10^5", "`y` is not a vowel"],
        "starter_code": "def count_vowels(text):\n    pass\n",
        "explanation": "Lower-case the text and count characters that belong to the set `'aeiou'`.",
        "reference": """
def count_vowels(text):
    return sum(1 for ch in text.lower() if ch in 'aeiou')
""",
        "tests": [
            {"input": ["Python Arena"], "public": True},
            {"input": [""], "public": True, "note": "Empty text has no vowels"},
            {"input": ["rhythm"]},
            {"input": ["AEIOU aeiou"]},
            {"input": ["The quick brown fox jumps over the lazy dog!"]},
            {"input": ["x" * 50000 + "e" * 50000]},
        ],
    },
    {
        "slug": "multiples-sum",
        "title": "Sum of multiples",
        "difficulty": "easy",
        "mode": "stdio",
        "function_name": None,
        "signature": None,
        "statement": (
            "Read a single integer `n` from standard input. Print the sum of every positive integer "
            "smaller than `n` that is divisible by 3 or by 5."
        ),
        "input_spec": "One line containing the integer `n`.",
        "output_spec": "One line containing the sum.",
        "constraints": ["0 <= n <= 10^7"],
        "starter_code": "n = int(input())\n\n# print the answer\n",
        "explanation": "Loop from 1 to n - 1, or use the arithmetic-series formula for multiples of 3, of 5, and subtract multiples of 15 so they are not counted twice.",
        "reference": """
n = int(input())
def s(k):
    m = (n - 1) // k
    return k * m * (m + 1) // 2
print(s(3) + s(5) - s(15))
""",
        "tests": [
            {"input": "10\n", "public": True, "note": "3 + 5 + 6 + 9 = 23"},
            {"input": "16\n", "public": True},
            {"input": "0\n"},
            {"input": "1\n"},
            {"input": "3\n"},
            {"input": "1000\n"},
            {"input": "10000000\n"},
        ],
    },
    {
        "slug": "second-largest",
        "title": "Second largest value",
        "difficulty": "easy",
        "mode": "function",
        "function_name": "second_largest",
        "signature": "def second_largest(nums: list[int]) -> int | None:",
        "statement": (
            "Return the second largest **distinct** value in `nums`. "
            "If there are fewer than two distinct values, return `None`."
        ),
        "input_spec": "`nums`: list of integers (may contain duplicates, may be empty).",
        "output_spec": "An integer or `None`.",
        "constraints": ["0 <= len(nums) <= 10^5"],
        "starter_code": "def second_largest(nums):\n    pass\n",
        "explanation": "Track the largest and second-largest distinct values in one pass, or sort the set of values.",
        "reference": """
def second_largest(nums):
    values = sorted(set(nums))
    return values[-2] if len(values) >= 2 else None
""",
        "tests": [
            {"input": [[4, 9, 2, 9, 7]], "public": True, "note": "9 appears twice, so the answer is 7"},
            {"input": [[5, 5, 5]], "public": True},
            {"input": [[]]},
            {"input": [[-1, -5]]},
            {"input": [[1]]},
            {"input": [[0, -1, 0, -1]]},
            {"input": [list(range(100000))]},
        ],
    },
    {
        "slug": "balanced-brackets",
        "title": "Balanced brackets",
        "difficulty": "medium",
        "mode": "function",
        "function_name": "is_balanced",
        "signature": "def is_balanced(text: str) -> bool:",
        "statement": (
            "A string is balanced when every opening bracket `(`, `[` or `{` is closed by the matching "
            "bracket in the correct order. Characters that are not brackets are ignored.\n\n"
            "Return `True` if `text` is balanced, otherwise `False`."
        ),
        "input_spec": "`text`: any string.",
        "output_spec": "`True` or `False`.",
        "constraints": ["0 <= len(text) <= 10^5"],
        "starter_code": "def is_balanced(text):\n    pass\n",
        "explanation": "Push opening brackets onto a stack. On a closing bracket, the stack must be non-empty and its top must be the matching opener. At the end the stack must be empty.",
        "reference": """
def is_balanced(text):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in text:
        if ch in '([{':
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack
""",
        "tests": [
            {"input": ["print(items[0])"], "public": True},
            {"input": ["{(})"], "public": True, "note": "Brackets cross each other"},
            {"input": [""]},
            {"input": ["((("]},
            {"input": [")("]},
            {"input": ["a{b[c(d)e]f}g"]},
            {"input": ["([]{})" * 10000]},
            {"input": ["(" * 50000 + ")" * 49999]},
        ],
    },
    {
        "slug": "run-length",
        "title": "Run-length encoding",
        "difficulty": "medium",
        "mode": "function",
        "function_name": "encode",
        "signature": "def encode(text: str) -> str:",
        "statement": (
            "Compress `text` by replacing each run of identical consecutive characters with the "
            "character followed by the run length. Runs of length 1 are written without a number.\n\n"
            "For example `aaabcc` becomes `a3bc2`."
        ),
        "input_spec": "`text`: a string of letters.",
        "output_spec": "The encoded string.",
        "constraints": ["0 <= len(text) <= 10^5", "Upper and lower case letters are different characters"],
        "starter_code": "def encode(text):\n    pass\n",
        "explanation": "Scan the string while counting the current run. When the character changes, append the character and, if the run is longer than 1, its length.",
        "reference": """
def encode(text):
    out = []
    i = 0
    while i < len(text):
        j = i
        while j < len(text) and text[j] == text[i]:
            j += 1
        out.append(text[i] + (str(j - i) if j - i > 1 else ''))
        i = j
    return ''.join(out)
""",
        "tests": [
            {"input": ["aaabcc"], "public": True},
            {"input": ["abc"], "public": True},
            {"input": [""]},
            {"input": ["a"]},
            {"input": ["aAaa"]},
            {"input": ["zzzzzzzzzzzz"]},
            {"input": ["ab" * 20000 + "c" * 15]},
        ],
    },
    {
        "slug": "merge-ranges",
        "title": "Merge overlapping ranges",
        "difficulty": "medium",
        "mode": "function",
        "function_name": "merge_ranges",
        "signature": "def merge_ranges(ranges: list[list[int]]) -> list[list[int]]:",
        "statement": (
            "Each item in `ranges` is `[start, end]` with `start <= end`. Merge every group of ranges "
            "that overlap or touch (for example `[1, 3]` and `[3, 5]`), and return the merged ranges "
            "sorted by start."
        ),
        "input_spec": "`ranges`: list of `[start, end]` pairs in any order.",
        "output_spec": "A list of merged `[start, end]` pairs sorted by start.",
        "constraints": ["0 <= len(ranges) <= 10^4", "-10^6 <= start <= end <= 10^6"],
        "starter_code": "def merge_ranges(ranges):\n    pass\n",
        "explanation": "Sort by start. Keep extending the last merged range while the next range starts at or before its end; otherwise begin a new range.",
        "reference": """
def merge_ranges(ranges):
    merged = []
    for start, end in sorted(ranges):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged
""",
        "tests": [
            {"input": [[[8, 10], [1, 3], [2, 6]]], "public": True},
            {"input": [[[1, 3], [3, 5]]], "public": True, "note": "Touching ranges merge"},
            {"input": [[]]},
            {"input": [[[5, 5]]]},
            {"input": [[[1, 10], [2, 3], [4, 5]]]},
            {"input": [[[-5, -1], [0, 2], [-1, 0]]]},
            {"input": [[[i * 3, i * 3 + 1] for i in range(3000)]]},
        ],
    },
    {
        "slug": "word-ranking",
        "title": "Most frequent words",
        "difficulty": "medium",
        "mode": "stdio",
        "function_name": None,
        "signature": None,
        "statement": (
            "The first line of input contains an integer `k`. The remaining lines contain text.\n\n"
            "Words are maximal runs of the letters `a` to `z` after converting the text to lower case. "
            "Print the `k` most frequent words, one per line, as `word count`. Order by count "
            "(highest first) and break ties alphabetically. If there are fewer than `k` distinct words, "
            "print all of them."
        ),
        "input_spec": "Line 1: `k`. Lines 2 and onward: free text (possibly none).",
        "output_spec": "Up to `k` lines in the form `word count`.",
        "constraints": ["1 <= k <= 100", "Total input size <= 10^5 characters"],
        "starter_code": "import sys\n\nk = int(sys.stdin.readline())\ntext = sys.stdin.read()\n\n# print the k most frequent words\n",
        "explanation": "Use `re.findall('[a-z]+', text.lower())` and `collections.Counter`, then sort the items by `(-count, word)`.",
        "reference": """
import re, sys
from collections import Counter
k = int(sys.stdin.readline())
counts = Counter(re.findall('[a-z]+', sys.stdin.read().lower()))
for word, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:k]:
    print(word, n)
""",
        "tests": [
            {"input": "2\nthe cat and the hat\nand the bat\n", "public": True},
            {"input": "3\nBig big BIG deal.\n", "public": True, "note": "Case is ignored; fewer than k words"},
            {"input": "5\n"},
            {"input": "1\nx-ray x ray\n"},
            {"input": "2\nb a c b a c\n"},
            {"input": "4\n" + "lorem ipsum dolor sit amet " * 2000 + "lorem\n"},
        ],
    },
    {
        "slug": "spiral-order",
        "title": "Spiral order",
        "difficulty": "medium",
        "mode": "function",
        "function_name": "spiral",
        "signature": "def spiral(matrix: list[list[int]]) -> list[int]:",
        "statement": (
            "Return the elements of a rectangular `matrix` in clockwise spiral order, starting at the "
            "top-left corner and moving right first."
        ),
        "input_spec": "`matrix`: list of rows, all rows have the same length.",
        "output_spec": "A flat list of integers.",
        "constraints": ["0 <= rows, columns <= 100"],
        "starter_code": "def spiral(matrix):\n    pass\n",
        "explanation": "Keep four boundaries (top, bottom, left, right). Walk the top row, right column, bottom row and left column, shrinking the boundaries after each side.",
        "reference": """
def spiral(matrix):
    out = []
    if not matrix or not matrix[0]:
        return out
    top, bottom, left, right = 0, len(matrix) - 1, 0, len(matrix[0]) - 1
    while top <= bottom and left <= right:
        for c in range(left, right + 1):
            out.append(matrix[top][c])
        for r in range(top + 1, bottom + 1):
            out.append(matrix[r][right])
        if top < bottom:
            for c in range(right - 1, left - 1, -1):
                out.append(matrix[bottom][c])
        if left < right:
            for r in range(bottom - 1, top, -1):
                out.append(matrix[r][left])
        top, bottom, left, right = top + 1, bottom - 1, left + 1, right - 1
    return out
""",
        "tests": [
            {"input": [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], "public": True},
            {"input": [[[1, 2, 3, 4], [5, 6, 7, 8]]], "public": True},
            {"input": [[]]},
            {"input": [[[7]]]},
            {"input": [[[1], [2], [3]]]},
            {"input": [[[1, 2, 3]]]},
            {"input": [[[r * 100 + c for c in range(100)] for r in range(100)]]},
        ],
    },
    {
        "slug": "longest-fresh-run",
        "title": "Longest run without repeats",
        "difficulty": "hard",
        "mode": "function",
        "function_name": "longest_unique",
        "signature": "def longest_unique(text: str) -> int:",
        "statement": (
            "Return the length of the longest contiguous substring of `text` in which no character "
            "appears more than once."
        ),
        "input_spec": "`text`: any string.",
        "output_spec": "An integer.",
        "constraints": ["0 <= len(text) <= 2 * 10^5", "An O(n^2) solution will time out on the largest tests"],
        "starter_code": "def longest_unique(text):\n    pass\n",
        "explanation": "Slide a window over the string and remember the last index of each character. When a character repeats inside the window, move the window start just past its previous position.",
        "reference": """
def longest_unique(text):
    last = {}
    start = best = 0
    for i, ch in enumerate(text):
        if ch in last and last[ch] >= start:
            start = last[ch] + 1
        last[ch] = i
        best = max(best, i - start + 1)
    return best
""",
        "tests": [
            {"input": ["abcabcbb"], "public": True, "note": "'abc' has length 3"},
            {"input": ["pwwkew"], "public": True},
            {"input": [""]},
            {"input": ["aaaa"]},
            {"input": ["abba"]},
            {"input": ["dvdf"]},
            {"input": ["".join(chr(33 + (i % 90)) for i in range(200000))]},
        ],
    },
    {
        "slug": "grid-routes",
        "title": "Routes through a grid",
        "difficulty": "hard",
        "mode": "function",
        "function_name": "count_routes",
        "signature": "def count_routes(grid: list[str]) -> int:",
        "statement": (
            "`grid` is a list of equal-length strings. `.` is an open cell and `#` is a wall. "
            "Starting in the top-left cell, you may only move **right** or **down** into open cells.\n\n"
            "Return the number of different routes to the bottom-right cell, modulo `1_000_000_007`. "
            "If the start or the end is a wall, return 0."
        ),
        "input_spec": "`grid`: list of strings made of `.` and `#`.",
        "output_spec": "An integer between 0 and 1_000_000_006.",
        "constraints": ["1 <= rows, columns <= 500"],
        "starter_code": "def count_routes(grid):\n    MOD = 1_000_000_007\n    pass\n",
        "explanation": "Dynamic programming: the number of routes into a cell is the sum of routes into the cell above and the cell to the left, or 0 for walls. Keep one row of counts to save memory.",
        "reference": """
def count_routes(grid):
    MOD = 1_000_000_007
    cols = len(grid[0])
    row = [0] * cols
    for r, line in enumerate(grid):
        for c, cell in enumerate(line):
            if cell == '#':
                row[c] = 0
            elif r == 0 and c == 0:
                row[c] = 1
            elif c > 0:
                row[c] = (row[c] + row[c - 1]) % MOD
    return row[-1] % MOD
""",
        "tests": [
            {"input": [["...", ".#.", "..."]], "public": True, "note": "Two routes go around the wall"},
            {"input": [["#.", ".."]], "public": True},
            {"input": [["."]]},
            {"input": [["..", ".#"]]},
            {"input": [["....", "...."]]},
            {"input": [["." * 500 for _ in range(500)]]},
            {"input": [[("." * 499 + "#") if r == 250 else "." * 500 for r in range(500)]]},
        ],
    },
]


def _run_function(source: str, name: str, args: list[Any]) -> Any:
    namespace: dict[str, Any] = {}
    exec(textwrap.dedent(source), namespace)  # noqa: S102 - trusted reference code, build time only
    return json.loads(json.dumps(namespace[name](*json.loads(json.dumps(args)))))


def _run_stdio(source: str, stdin: str) -> str:
    import sys

    old_stdin = sys.stdin
    sys.stdin = io.StringIO(stdin)
    buffer = io.StringIO()
    try:
        with redirect_stdout(buffer):
            exec(textwrap.dedent(source), {"__name__": "__main__"})  # noqa: S102
    finally:
        sys.stdin = old_stdin
    return buffer.getvalue()


def build() -> list[dict[str, Any]]:
    out = []
    for q in QUESTIONS:
        tests = []
        for ordinal, t in enumerate(q["tests"], start=1):
            if q["mode"] == "function":
                expected = _run_function(q["reference"], q["function_name"], t["input"])
            else:
                expected = _run_stdio(q["reference"], t["input"])
            tests.append(
                {
                    "ordinal": ordinal,
                    "input": t["input"],
                    "expected": expected,
                    "is_public": bool(t.get("public")),
                    "note": t.get("note"),
                }
            )
        item = {k: v for k, v in q.items() if k not in ("tests", "reference")}
        item["reference_solution"] = textwrap.dedent(q["reference"]).strip() + "\n"
        item["cpu_seconds"] = 2.0
        item["memory_mb"] = 256
        item["tests"] = tests
        out.append(item)
    return out


if __name__ == "__main__":
    target = Path(__file__).with_name("questions.json")
    target.write_text(json.dumps(build(), ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(QUESTIONS)} questions to {target}")
