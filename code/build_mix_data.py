#!/usr/bin/env python3
"""Build the Mix and Match Generator's data files.

Reads the canonical phone book (~/workspace/jah-ai-models/ai-catalog.json)
and the robot-matcher pair catalog, then writes:
  data/ai-compact.json        441 mixable AIs (id, name, category, desc, caps)
  data/best-pair-by-ai.json   best robot-matcher pair per AI id
  data/mixes/az-<l>.json      2,600 seeded deterministic mixes (100/letter)
  data/best/best-mix.json     the current "Best of All Mixes" pick
  data/mix-state.json         {next_seq, total_seeded}

Deterministic: same inputs -> same outputs. Safe to re-run (seeds stable).
"""
import json, os, hashlib, re, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PB = os.path.expanduser("~/workspace/jah-ai-models/ai-catalog.json")
RM = os.path.expanduser("~/workspace/signature-ai-robot-matcher/data/pairs-catalog.json")

def h64(s):
    return int(hashlib.sha256(s.encode("utf-8")).hexdigest()[:16], 16)

def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)

def main():
    cat = load(PB)
    recs = cat["records"]
    compact = []
    for r in recs:
        compact.append({
            "id": r["ID"],
            "name": r["NAME"],
            "cat": r.get("CATEGORY", r.get("TYPE", "")),
            "desc": (r.get("DESCRIPTION") or "")[:280],
            "caps": (r.get("CAPABILITIES") or [])[:8],
        })
    os.makedirs(os.path.join(ROOT, "data", "mixes"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "data", "best"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "ai-compact.json"), "w", encoding="utf-8") as f:
        json.dump({"built": datetime.date.today().isoformat(), "count": len(compact), "ais": compact}, f)

    # best pair per AI id (highest score)
    best = {}
    try:
        pairs = load(RM)
        for p in pairs:
            aid = p.get("ai_id")
            sc = p.get("score", 0) or 0
            if aid and (aid not in best or sc > best[aid]["score"]):
                best[aid] = {"pair": p["id"], "body": p.get("body_name", ""),
                             "body_class": p.get("body_class", ""), "score": sc,
                             "url": p.get("url", "")}
    except FileNotFoundError:
        pass
    with open(os.path.join(ROOT, "data", "best-pair-by-ai.json"), "w", encoding="utf-8") as f:
        json.dump(best, f)

    # seeded mixes: deterministic pairs, 100 per letter by blend-name initial
    by_id = {a["id"]: a for a in compact}
    ids = [a["id"] for a in compact]
    n = len(ids)
    STOP = {"the", "a", "an", "of", "ai", "signature"}
    def tok(name):
        return [t for t in re.findall(r"[a-z0-9]+", name.lower()) if t not in STOP]
    def blend(a, b):
        ta, tb = tok(a["name"]), tok(b["name"])
        w1 = ta[0] if ta else "mix"
        w2 = tb[-1] if tb else "mind"
        return (w1 + " " + w2).title()
    letters = "abcdefghijklmnopqrstuvwxyz"
    per = 100
    seq = 1
    scored = []
    # how many token-initials exist per letter (limits what's fillable)
    tok_initials = {}
    for a in compact:
        for t in tok(a["name"]):
            tok_initials[t[0]] = tok_initials.get(t[0], 0) + 1
    for li, L in enumerate(letters):
        out = []
        k = 0
        # bounded: impossible letters (e.g. x) would loop forever otherwise
        maxk = 40000 if tok_initials.get(L) else 0
        while len(out) < per and k < maxk:
            i = h64("mix-a-%s-%d" % (L, k)) % n
            j = h64("mix-b-%s-%d" % (L, k)) % n
            k += 1
            if i == j:
                continue
            a, b = by_id[ids[i]], by_id[ids[j]]
            name = blend(a, b)
            if not name.lower().startswith(L):
                continue
            caps = []
            for c in a["caps"] + b["caps"]:
                if c not in caps:
                    caps.append(c)
            mid = "JAH-AI-MIX-%06d" % seq
            seq += 1
            rec = {"id": mid, "name": name,
                   "sources": [{"id": a["id"], "name": a["name"]},
                               {"id": b["id"], "name": b["name"]}],
                   "abilities": caps[:10],
                   "blurb": "%s fuses %s with %s." % (name, a["name"], b["name"])}
            out.append(rec)
            scored.append((len(caps), rec))
        with open(os.path.join(ROOT, "data", "mixes", "az-%s.json" % L), "w", encoding="utf-8") as f:
            json.dump({"letter": L.upper(), "count": len(out), "mixes": out}, f)

    # best of all mixes: most abilities wins (deterministic), tie -> lowest id
    scored.sort(key=lambda t: (-t[0], t[1]["id"]))
    top = scored[0][1]
    bpair = None
    for s in top["sources"]:
        cand = best.get(s["id"])
        if cand and (not bpair or cand["score"] > bpair["score"]):
            bpair = cand
    bestmix = {
        "id": top["id"], "name": top["name"],
        "sources": top["sources"], "abilities": top["abilities"],
        "blurb": top["blurb"],
        "why": ["The richest ability set of all %d seeded mixes (%d distinct abilities from %s + %s)." %
                (seq - 1, len(top["abilities"]), top["sources"][0]["name"], top["sources"][1]["name"]),
                "Recomputed by the daily best-mix reviewer; a better mix takes its place automatically."],
        "implications": [
            "Shows what mix-and-match can do: two specialists become one generalist without losing either specialty.",
            "Every ability listed was written for the source AIs in the phone book — nothing invented.",
            "Any mix you generate gets the same treatment: description, abilities, implications, robot body, downloads."],
        "stats": ["%d seeded mixes in the archive" % (seq - 1),
                  "%d distinct abilities in this mix" % len(top["abilities"]),
                  "2 source AIs from the Signature AI Phone Book"],
        "robot_body": bpair,
        "built": datetime.date.today().isoformat(),
    }
    with open(os.path.join(ROOT, "data", "best", "best-mix.json"), "w", encoding="utf-8") as f:
        json.dump(bestmix, f, indent=1)
    with open(os.path.join(ROOT, "data", "mix-state.json"), "w", encoding="utf-8") as f:
        json.dump({"next_seq": seq, "total_seeded": seq - 1,
                   "updated": datetime.date.today().isoformat()}, f)
    print("ais=%d bestpairs=%d seeded=%d best=%s (%s)" %
          (len(compact), len(best), seq - 1, top["id"], top["name"]))

if __name__ == "__main__":
    main()
