"""Deterministic, beginner-friendly explanations of common Python errors.

The original traceback is always shown next to these explanations; they add
context, they never replace it.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class Explanation:
    title: str
    summary: str
    tips: list[str] = field(default_factory=list)
    line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_BY_ERROR: dict[str, tuple[str, str, list[str]]] = {
    "SyntaxError": (
        "Python could not read your code",
        "A SyntaxError means the code breaks Python's grammar, so nothing ran at all.",
        [
            "Look at the line shown in the traceback and the line just above it.",
            "Check for missing colons after if, for, while, def and class.",
            "Make sure every bracket and quote you open is closed.",
        ],
    ),
    "IndentationError": (
        "The indentation does not line up",
        "Python uses indentation to group code into blocks, and one block is not indented as expected.",
        [
            "Indent the body of if, for, while, def and class by 4 spaces.",
            "Keep lines in the same block at exactly the same indentation.",
            "Avoid mixing tabs and spaces.",
        ],
    ),
    "TabError": (
        "Tabs and spaces are mixed",
        "This line mixes tab characters with spaces for indentation.",
        ["Re-indent the block using spaces only."],
    ),
    "NameError": (
        "A name is used before it exists",
        "Python found a variable or function name that has not been defined at that point.",
        [
            "Check the spelling and capitalisation of the name.",
            "Make sure the variable is assigned before the line that uses it.",
            "Strings need quotes: print(hello) looks for a variable, print('hello') prints text.",
        ],
    ),
    "TypeError": (
        "A value has the wrong type for this operation",
        "An operation or function received a value of a type it cannot work with.",
        [
            "Adding text and a number fails: convert with str(n) or int(text) first.",
            "Check how many arguments you pass to the function.",
            "input() always returns a string; convert it before doing arithmetic.",
        ],
    ),
    "ValueError": (
        "The type is right but the value is not",
        "A function got a value of the correct type that it still cannot use, such as int('abc').",
        [
            "Print the value just before the failing line to see what it really is.",
            "Strip spaces from input with .strip() before converting it.",
        ],
    ),
    "IndexError": (
        "A list position does not exist",
        "You asked for an index outside the list. Indexes start at 0 and end at len(items) - 1.",
        [
            "Check the loop range: range(len(items)) already stops before the last index plus one.",
            "Guard against empty lists before reading items[0].",
        ],
    ),
    "KeyError": (
        "A dictionary key is missing",
        "You looked up a key that the dictionary does not contain.",
        [
            "Use d.get(key, default) to read a key that might be missing.",
            "Check with 'if key in d:' before reading it.",
        ],
    ),
    "ZeroDivisionError": (
        "Division by zero",
        "A number was divided (or taken modulo) by zero, which has no result.",
        ["Check that the divisor is not zero before dividing."],
    ),
    "AttributeError": (
        "This value does not have that attribute",
        "You used .something on a value whose type does not provide it, often None.",
        [
            "Print type(value) to see what you actually have.",
            "Methods like list.sort() return None; do not assign their result.",
        ],
    ),
    "RecursionError": (
        "Too many nested function calls",
        "A function kept calling itself without reaching a stopping case.",
        ["Make sure your recursive function has a base case that is always reached."],
    ),
    "EOFError": (
        "The program asked for more input than it was given",
        "input() was called but there was no more text in standard input.",
        ["Add the missing lines to the input panel, one value per line."],
    ),
    "ModuleNotFoundError": (
        "That module is not available",
        "The sandbox only provides Python's standard library.",
        ["Use only standard-library modules such as math, itertools, collections and re."],
    ),
    "ImportError": (
        "The import failed",
        "Python found the module but not the name you imported from it, or it is not available here.",
        ["Check the spelling of the imported name."],
    ),
    "UnboundLocalError": (
        "A local variable is used before it is assigned",
        "Assigning to a name inside a function makes it local to that function, even above the assignment.",
        ["Assign the variable before you read it, or pass the value in as a parameter."],
    ),
}

_BY_STATUS: dict[str, tuple[str, str, list[str]]] = {
    "TIMEOUT": (
        "The program ran out of time",
        "Execution stopped because it took longer than the time limit.",
        [
            "Look for a loop whose condition never becomes false.",
            "If the program waits for input(), give it input in the input panel.",
            "For large inputs, look for a faster algorithm.",
        ],
    ),
    "MEMORY_LIMIT": (
        "The program used too much memory",
        "Execution stopped because it went over the memory limit.",
        ["Avoid building very large lists; process items one at a time where possible."],
    ),
    "OUTPUT_LIMIT": (
        "The program printed too much",
        "Output was cut off after the size limit, and the program was stopped.",
        ["Check for a print() inside a loop that never ends."],
    ),
}

_LINE_RE = re.compile(r'File "(?:main|solution)\.py", line (\d+)')


def explain(status: str, error_type: str | None, stderr: str) -> Explanation | None:
    entry = _BY_STATUS.get(status)
    if entry is None and error_type:
        entry = _BY_ERROR.get(error_type)
    if entry is None:
        if status in ("RUNTIME_ERROR", "SYNTAX_ERROR") and error_type:
            entry = (
                f"{error_type} was raised",
                "Your program stopped because of an error. The traceback shows where it happened.",
                ["Read the last line of the traceback first; it names the problem."],
            )
        else:
            return None
    lines = _LINE_RE.findall(stderr or "")
    line = int(lines[-1]) if lines else None
    title, summary, tips = entry
    return Explanation(title=title, summary=summary, tips=list(tips), line=line)
