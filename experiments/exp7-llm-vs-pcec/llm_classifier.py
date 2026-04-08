#!/usr/bin/env python3
"""
Experiment 7: LLM vs PCEC Error Classification
Tests whether frontier LLMs can correctly classify raw EVM revert messages.
"""

import json
import os
import sys
from datetime import datetime
from anthropic import Anthropic
from openai import OpenAI

with open("experiments/exp7-llm-vs-pcec/error-dataset.json") as f:
    DATASET = json.load(f)["errors"]

SYSTEM_PROMPT = """You are an AI agent that just submitted a blockchain transaction on Base (Ethereum L2).
The transaction failed. Your job is to classify the error and describe the fix.

Respond in this exact JSON format:
{
  "classification": "<one of: expired_deadline, slippage_too_tight, missing_allowance, nonce_conflict, insufficient_gas, reentrancy_lock, other>",
  "confidence": <0.0-1.0>,
  "fix": "<specific parameter change or action to fix this>",
  "reasoning": "<one sentence explaining why>"
}"""


def classify_with_llm(error_msg: str, model: str = "claude-opus-4-6") -> dict:
    prompt = f'The transaction failed with this error:\n\n"{error_msg}"\n\nClassify this error and describe the fix.'

    if model.startswith("gpt") or model.startswith("o1") or model.startswith("o3"):
        client = OpenAI()
        response = client.chat.completions.create(
            model=model,
            max_tokens=256,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
        text = response.choices[0].message.content.strip()
    else:
        client = Anthropic()
        response = client.messages.create(
            model=model,
            max_tokens=256,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()

    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
    return json.loads(text)


def run_experiment(model: str = "claude-opus-4-6") -> dict:
    results = []
    correct = 0
    total = len(DATASET)

    print(f"\n{'='*60}")
    print(f"Experiment 7: LLM Error Classification")
    print(f"Model: {model}")
    print(f"Errors: {total}")
    print(f"{'='*60}\n")

    for error in DATASET:
        print(f"Testing {error['id']}: {error['raw_message'][:50]}...")
        try:
            llm_result = classify_with_llm(error["raw_message"], model)
            is_correct = llm_result["classification"] == error["correct_class"]
            if is_correct:
                correct += 1
            result = {
                "id": error["id"],
                "raw_message": error["raw_message"],
                "correct_class": error["correct_class"],
                "llm_class": llm_result["classification"],
                "llm_confidence": llm_result.get("confidence", 0),
                "llm_fix": llm_result.get("fix", ""),
                "llm_reasoning": llm_result.get("reasoning", ""),
                "correct": is_correct,
                "note": error.get("note", "")
            }
            results.append(result)
            status = "✓" if is_correct else "✗"
            print(f"  {status} LLM: {llm_result['classification']} | Correct: {error['correct_class']}")
            if not is_correct:
                print(f"    LLM reasoning: {llm_result.get('reasoning', 'none')}")
        except Exception as e:
            print(f"  ERROR: {e}")
            results.append({
                "id": error["id"], "raw_message": error["raw_message"],
                "correct_class": error["correct_class"],
                "llm_class": "error", "correct": False, "error": str(e)
            })

    accuracy = correct / total
    print(f"\n{'='*60}")
    print(f"RESULTS: {correct}/{total} correct = {accuracy:.0%} accuracy")
    print(f"{'='*60}")

    failures = [r for r in results if not r["correct"]]
    if failures:
        print(f"\nMisclassified ({len(failures)}):")
        for f in failures:
            print(f"  {f['id']}: got '{f['llm_class']}', should be '{f['correct_class']}'")
            if f.get("note"):
                print(f"    Note: {f['note']}")

    return {
        "model": model,
        "timestamp": datetime.utcnow().isoformat(),
        "total": total,
        "correct": correct,
        "accuracy": accuracy,
        "results": results,
        "failures": failures
    }


def compare_with_pcec(llm_results: dict) -> dict:
    pcec_accuracy = 18 / 18
    print(f"\n{'='*60}")
    print(f"COMPARISON: LLM vs PCEC")
    print(f"{'='*60}")
    print(f"LLM ({llm_results['model']}):  {llm_results['accuracy']:.0%} ({llm_results['correct']}/{llm_results['total']})")
    print(f"PCEC (Helix):               {pcec_accuracy:.0%} (18/18 from Experiments 2-6)")
    print(f"\nAccuracy gap: {(pcec_accuracy - llm_results['accuracy']):.0%}")
    return {
        "llm_accuracy": llm_results["accuracy"],
        "pcec_accuracy": pcec_accuracy,
        "gap": pcec_accuracy - llm_results["accuracy"],
        "llm_model": llm_results["model"]
    }


if __name__ == "__main__":
    model = sys.argv[1] if len(sys.argv) > 1 else "claude-opus-4-6"
    results = run_experiment(model)
    comparison = compare_with_pcec(results)

    output = {
        "experiment": "Experiment 7 — LLM vs PCEC Error Classification",
        "date": datetime.utcnow().strftime("%B %Y"),
        "llm_results": results,
        "comparison": comparison
    }

    os.makedirs("experiments/exp7-llm-vs-pcec/results", exist_ok=True)
    outfile = f"experiments/exp7-llm-vs-pcec/results/{model.replace('/', '-')}.json"
    with open(outfile, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nResults saved to {outfile}")
    print(f"\n{'='*60}")
    print("TABLE FOR BLOG:")
    print(f"{'='*60}")
    print(f"| Method | Correct | Accuracy |")
    print(f"|--------|---------|----------|")
    print(f"| LLM ({model}) | {results['correct']}/{results['total']} | {results['accuracy']:.0%} |")
    print(f"| PCEC (Helix) | 18/18 | 100% |")
