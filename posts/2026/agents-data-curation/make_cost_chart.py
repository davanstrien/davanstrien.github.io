# /// script
# requires-python = ">=3.12"
# dependencies = ["matplotlib==3.11.1"]
# ///
"""Render the cost figure and shareable PNG: uv run make_cost_chart.py."""

from pathlib import Path
import json
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

plt.switch_backend("Agg")

ROOT = Path(__file__).parent
DATA = json.loads((ROOT / "cost-data.json").read_text())
plt.rcParams.update(
    {"font.family": "DejaVu Sans", "font.size": 13, "svg.fonttype": "path"}
)
fig, ax = plt.subplots(figsize=(11, 6.3))
fig.subplots_adjust(left=0.34, right=0.94, top=0.74, bottom=0.32)
values = [
    DATA["measured_job_running_usd"],
    DATA["api_batch_estimates_usd"]["gemini-2.5-flash-lite"],
    DATA["api_batch_estimates_usd"]["gpt-5.6-luna"],
]
labels = [
    "SetFit on HF Jobs\nMeasured running compute",
    "Gemini 2.5 Flash-Lite\nEstimated batch API cost",
    "GPT-5.6 Luna\nEstimated batch API cost",
]
for y, value in zip([2, 1, 0], values):
    measured = y == 2
    ax.barh(
        y,
        value,
        height=0.53,
        color="#357383" if measured else "#e6d8c0",
        edgecolor="#357383" if measured else "#a78b5d",
        linewidth=1.2,
        hatch=None if measured else "///",
        zorder=3,
    )
    ax.text(
        value + 0.45,
        y,
        f"${value:.2f}",
        va="center",
        fontweight="bold",
        fontsize=14,
        color="#243646",
    )
ax.set_yticks([2, 1, 0], labels)
ax.tick_params(axis="y", length=0, pad=14, labelcolor="#243646", labelsize=12)
ax.tick_params(axis="x", length=0, pad=8, labelcolor="#546270", labelsize=11)
ax.set_xlim(0, 30)
ax.set_xticks([0, 5, 10, 15, 20, 25, 30])
ax.xaxis.set_major_formatter(FuncFormatter(lambda x, _: f"${x:.0f}"))
ax.grid(axis="x", color="#e4e8eb", zorder=0)
ax.set_axisbelow(True)
for spine in ax.spines.values():
    spine.set_visible(False)
ax.set_xlabel("USD", fontsize=11, color="#546270", labelpad=8)
fig.text(
    0.055,
    0.93,
    "Labelling 191,724 documents",
    fontsize=23,
    fontweight="bold",
    color="#243646",
    va="top",
)
fig.text(
    0.055,
    0.865,
    "Eligible documents from a 1% English FinePDFs-Edu sample",
    fontsize=13,
    color="#546270",
    va="top",
)
notes = [
    "Training / model-selection GPU experiments: ~$2.90 extra. Agent and storage costs excluded.",
    "API estimates: 1,300 input + 10 output tokens per document; batch, thinking off, no cache or retries.",
    "No LLM run or label-quality comparison. Prices checked 10 September 2026.",
]
for y, note in zip([0.18, 0.137, 0.094], notes):
    fig.text(0.055, y, note, fontsize=10.1, color="#546270", va="top")
fig.text(
    0.055,
    0.044,
    "Sources: recorded HF Jobs runtime; Google and OpenAI API pricing.",
    fontsize=9.5,
    color="#667482",
    va="top",
)
fig.savefig(
    ROOT / "cost-comparison.svg",
    facecolor="white",
    metadata={
        "Title": "Measured Jobs running cost and estimated LLM API costs",
        "Description": "Costs for 191,724 eligible documents. SetFit running cost is measured; API costs are estimates. No quality comparison was performed.",
    },
)
fig.savefig(ROOT / "cost-comparison.png", dpi=200, facecolor="white")
plt.close(fig)
print("Rendered cost-comparison.svg and cost-comparison.png")
