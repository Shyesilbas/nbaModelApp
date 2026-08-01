import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.inference import WinPredictor


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-json", required=True, help="Path to JSON file with a single feature row mapping")
    args = parser.parse_args()

    inp_path = Path(args.input_json)
    if not inp_path.exists():
        print(f"Input file not found: {inp_path}")
        sys.exit(2)
    with open(inp_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        print("Input JSON must be an object mapping feature names to values for a single row.")
        sys.exit(2)

    predictor = WinPredictor()
    out = predictor.predict_from_dict(data)

    print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main()

