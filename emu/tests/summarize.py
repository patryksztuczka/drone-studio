import json
import sys

from robot.api import ExecutionResult


def main(path):
    result = ExecutionResult(path)
    tests = [
        {"name": test.name, "passed": test.passed, "message": test.message}
        for test in result.suite.all_tests
    ]
    json.dump({"tests": tests}, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main(sys.argv[1])
