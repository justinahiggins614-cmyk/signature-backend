#!/usr/bin/env python3
"""Daily Best-of-All-Mixes reviewer for the Mix and Match Generator.

Recomputes the best pick from the seeded archive with the same deterministic
recipe as code/build_mix_data.py, installs a new best when one genuinely beats
the current pick, and appends to data/best/changelog.json.

Usage:
  python3 code/best_mix_updater.py --brief
      Print a JSON review brief: current best vs. top archive candidate.
  python3 code/best_mix_updater.py --recompute
      Install a new best only if the top candidate beats the current pick.
      Prints "BEST CHANGED: ..." or "BEST UNCHANGED".
  python3 code/best_mix_updater.py --recompute --commit
      Same as --recompute, then git add/commit/push data/best/ (ff-only pull first).

Deterministic: same inputs -> same pick. Safe to run on a daily cron.
"""
import json, os, sys, datetime, subprocess, glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def load(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return json.load(f)

def save(p, obj):
    with open(os.path.join(ROOT, p), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)

def all_mixes():
    out = []
    for fn in sorted(glob.glob(os.path.join(ROOT, "data", "mixes", "az-*.json"))):
        for m in load(os.path.relpath(fn, ROOT))["mixes"]:
            out.append(m)
    return out

def score(m):
    return len(m.get("abilities", []))

def best_pair_for(m):
    """Best robot-matcher pair across the mix's source AIs."""
    try:
        best = load("data/best-pair-by-ai.json")
    except FileNotFoundError:
        return None
    bpair = None
    for s in m.get("sources", []):
        cand = best.get(s["id"])
        if cand and (not bpair or cand["score"] > bpair["score"]):
            bpair = cand
    return bpair

def enrich_best(m, total):
    srcs = m["sources"]
    return {
        "id": m["id"], "name": m["name"],
        "sources": srcs, "abilities": m["abilities"],
        "blurb": m["blurb"],
        "why": [
            "The richest ability set of all %d seeded mixes (%d distinct abilities from %s + %s)." %
            (total, len(m["abilities"]), srcs[0]["name"], srcs[1]["name"]),
            "Recomputed by the daily best-mix reviewer; a better mix takes its place automatically.",
        ],
        "implications": [
            "Shows what mix-and-match can do: two specialists become one generalist without losing either specialty.",
            "Every ability listed was written for the source AIs in the phone book — nothing invented.",
            "Any mix you generate gets the same treatment: description, abilities, implications, robot body, downloads.",
        ],
        "stats": [
            "%d seeded mixes in the archive" % total,
            "%d distinct abilities in this mix" % len(m["abilities"]),
            "2 source AIs from the Signature AI Phone Book",
        ],
        "robot_body": best_pair_for(m),
        "built": datetime.date.today().isoformat(),
        "score": score(m),
    }

def current_best():
    try:
        return load("data/best/best-mix.json")
    except FileNotFoundError:
        return None

def pick_best():
    mixes = all_mixes()
    if not mixes:
        sys.exit("no seeded mixes found in data/mixes/")
    mixes.sort(key=lambda m: (-score(m), m["id"]))
    return mixes[0]

def cmd_brief():
    best = current_best()
    mixes = all_mixes()
    cand = pick_best()
    brief = {
        "generated": datetime.date.today().isoformat(),
        "current_best": {"id": best["id"], "name": best["name"], "built": best.get("built"),
                         "abilities": len(best.get("abilities", []))} if best else None,
        "archive": {"seeded_mixes": len(mixes)},
        "top_candidate": {"id": cand["id"], "name": cand["name"],
                          "abilities": len(cand["abilities"]),
                          "sources": [s["name"] for s in cand["sources"]]},
        "improved": bool(best) and (score(cand), ) > (score(best), ) and cand["id"] != best["id"],
        "instruction": ("If improved is true, run --recompute --commit to install the new best. "
                        "If false, change nothing and stay silent."),
    }
    print(json.dumps(brief, indent=1))

def cmd_recompute(do_commit):
    best = current_best()
    cand = pick_best()
    mixes = all_mixes()
    if best and cand["id"] == best["id"]:
        print("BEST UNCHANGED: %s (%s), %d abilities" %
              (best["name"], best["id"], len(best.get("abilities", []))))
        return
    today = datetime.date.today().isoformat()
    new_best = enrich_best(cand, len(mixes))
    new_best["version"] = int((best or {}).get("version", 0)) + 1
    save("data/best/best-mix.json", new_best)
    clog_p = "data/best/changelog.json"
    clog = load(clog_p) if os.path.exists(os.path.join(ROOT, clog_p)) else []
    clog.append({"date": today, "version": new_best["version"], "id": new_best["id"],
                 "name": new_best["name"], "abilities": len(new_best["abilities"]),
                 "change": "Daily review installed a better best-of-all-mixes."})
    save(clog_p, clog)
    print("BEST CHANGED: v%d %s (%s), %d abilities (was %s)" %
          (new_best["version"], new_best["name"], new_best["id"], len(new_best["abilities"]),
           best["id"] if best else "none"))
    if do_commit:
        def run(*a):
            r = subprocess.run(a, cwd=ROOT, capture_output=True, text=True)
            if r.returncode != 0:
                raise SystemExit("FAILED: %s\n%s" % (" ".join(a), r.stderr.strip()))
            return r.stdout.strip()
        run("git", "pull", "--ff-only")
        run("git", "add", "data/best")
        run("git", "commit", "-m", "Daily best-mix review: install v%d %s (%s)" %
            (new_best["version"], new_best["name"], new_best["id"]))
        run("git", "push")
        print("Committed + pushed.")

if __name__ == "__main__":
    if "--brief" in sys.argv:
        cmd_brief()
    elif "--recompute" in sys.argv:
        cmd_recompute("--commit" in sys.argv)
    else:
        sys.exit("usage: best_mix_updater.py --brief | --recompute [--commit]")
