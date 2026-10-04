#!/usr/bin/env python3
"""File user-generated mixes from the Mix and Match Generator into the AI phone book.

The mixes.html Generate flow builds two phone-book entries per mix (the
Signature version + the improved "best" version) and files them via a GitHub
issue labeled phonebook-mix on the jah-ai-models repo — a browser cannot push
to GitHub. This helper completes the filing: read the pending issues, validate
every entry against the catalog schema (exact keys, no ID/phone collisions),
re-ID canonically, append, commit ONLY ai-catalog.json, push, close the issue.

Usage:
  python3 code/file_mixes.py [--dry-run]
  python3 code/file_mixes.py entries.json [--dry-run]

  (no args)     : poll open issues labeled phonebook-mix, file each, close them.
  entries.json  : file a local JSON array of entry objects (same validation).

Flow: git pull --ff-only in ~/workspace/jah-ai-models -> validate ->
re-ID JAH-AI-MIX-#### canonically at append time -> append -> commit ONLY
ai-catalog.json -> push -> close filed issues with a comment.

Requires: gh CLI logged in (reads issues + closes them).
"""
import json, os, re, subprocess, sys, datetime

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG_CLONE = os.path.expanduser("~/workspace/jah-ai-models")
CATALOG_FILE = os.path.join(CATALOG_CLONE, "ai-catalog.json")
ISSUE_LABEL = "phonebook-mix"
SUBKEYS = ("RUNTIME", "DEMO", "VOICE", "ARTIFACTS")

def run(*args, cwd=CATALOG_CLONE, check=True):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise SystemExit("FAILED: %s\n%s" % (" ".join(args), r.stderr.strip()))
    return r

def load_catalog():
    with open(CATALOG_FILE, encoding="utf-8") as f:
        cat = json.load(f)
    return cat, (cat["records"] if isinstance(cat, dict) and "records" in cat else cat)

def keyset(records):
    keys = set()
    sub = {sk: set() for sk in SUBKEYS}
    for r in records:
        keys.update(r.keys())
        for sk in SUBKEYS:
            if isinstance(r.get(sk), dict):
                sub[sk].update(r[sk].keys())
    return keys, sub

def validate(entries, records):
    if not isinstance(entries, list) or not entries:
        raise SystemExit("entries must be a non-empty JSON array")
    keys, sub = keyset(records)
    seen_ids = {r.get("ID") for r in records}
    seen_phones = {r.get("SIGNATURE_NUMBER") for r in records}
    for e in entries:
        missing = [k for k in keys if k not in e]
        extra = [k for k in e.keys() if k not in keys]
        if missing or extra:
            raise SystemExit("Key mismatch in %s: missing=%s extra=%s" % (e.get("NAME"), missing, extra))
        for sk in SUBKEYS:
            ek = set((e.get(sk) or {}).keys())
            mk = [k for k in sub[sk] if k not in ek]
            xk = [k for k in ek if k not in sub[sk]]
            if mk or xk:
                raise SystemExit("Sub-key mismatch in %s.%s: missing=%s extra=%s" % (e.get("NAME"), sk, mk, xk))
        if not str(e.get("ID", "")).startswith("JAH-AI-MIX-"):
            raise SystemExit("Refusing non-mix entry: %s (this helper files only JAH-AI-MIX-* mixes)" % e.get("ID"))
        if e.get("SIGNATURE_NUMBER") in seen_phones:
            raise SystemExit("Phone collision: %s already in catalog" % e.get("SIGNATURE_NUMBER"))
        seen_ids.add(e.get("ID")); seen_phones.add(e.get("SIGNATURE_NUMBER"))
    return True

def next_seq(records):
    nums = [int(m.group(1)) for r in records for m in [re.match(r"JAH-AI-MIX-(\d+)$", str(r.get("ID", "")))] if m]
    return (max(nums) + 1) if nums else 1

def re_id(entries, start):
    """Assign canonical JAH-AI-MIX-#### IDs + phone numbers at append time."""
    seq = start
    for e in entries:
        e["ID"] = "JAH-AI-MIX-%06d" % seq
        e["SIGNATURE_NUMBER"] = "1-800-%07d" % (7400000 + seq)
        seq += 1
    return seq

def extract_entries_from_body(body):
    m = re.search(r"```json\s*(\[.*?\])\s*```", body, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None

def list_open_issues():
    r = run("gh", "issue", "list", "--repo", "justinahiggins614-cmyk/jah-ai-models",
            "--label", ISSUE_LABEL, "--state", "open", "--limit", "50", "--json", "number,title,body",
            cwd=os.path.expanduser("~"))
    return json.loads(r.stdout or "[]")

def close_issue(n, comment):
    run("gh", "issue", "comment", str(n), "--repo", "justinahiggins614-cmyk/jah-ai-models", "--body", comment,
        cwd=os.path.expanduser("~"))
    run("gh", "issue", "close", str(n), "--repo", "justinahiggins614-cmyk/jah-ai-models",
        cwd=os.path.expanduser("~"))

def main():
    dry = "--dry-run" in sys.argv
    local = [a for a in sys.argv[1:] if a.endswith(".json")]

    if local:
        with open(local[0], encoding="utf-8") as f:
            jobs = [(None, json.load(f))]
    else:
        print("Polling open issues labeled %s ..." % ISSUE_LABEL)
        issues = list_open_issues()
        print("%d open issue(s)." % len(issues))
        jobs = []
        for i in issues:
            ent = extract_entries_from_body(i.get("body", ""))
            if not ent:
                print("Issue #%d: no entries block — skipping." % i["number"])
                continue
            jobs.append((i, ent))
        if not jobs:
            print("Nothing to file. Done.")
            return 0

    print("Pulling jah-ai-models (ff-only)...")
    print(run("git", "pull", "--ff-only").stdout.strip())
    cat, records = load_catalog()
    print("Catalog records: %d" % len(records))
    seq = next_seq(records)

    total = []
    for issue, entries in jobs:
        validate(entries, records)
        seq = re_id(entries, seq)
        # re-check collisions after canonical re-ID (both ID and phone)
        ids = {r.get("ID") for r in records}
        phones = {r.get("SIGNATURE_NUMBER") for r in records}
        dupes = [e["ID"] for e in entries if e["ID"] in ids]
        if dupes:
            raise SystemExit("Canonical re-ID collided (race): %s" % dupes)
        dupn = [e["SIGNATURE_NUMBER"] for e in entries if e["SIGNATURE_NUMBER"] in phones]
        if dupn:
            raise SystemExit("Canonical phone re-ID collided (race): %s" % dupn)
        records.extend(entries)
        total.extend(entries)
        print("Prepared %d entries for issue %s: %s" %
              (len(entries), ("#" + str(issue["number"])) if issue else "local",
               ", ".join(e["ID"] for e in entries)))

    if dry:
        print("DRY RUN: catalog untouched.")
        return 0

    with open(CATALOG_FILE, "w", encoding="utf-8") as f:
        json.dump(cat, f, ensure_ascii=False, indent=1)
        f.write("\n")
    run("git", "add", "ai-catalog.json")
    names = ", ".join(e["ID"] for e in total)
    run("git", "commit", "-m",
        "File user-generated mixes in the AI phone book: %s" % names)
    print(run("git", "push").stdout.strip())
    sha = run("git", "rev-parse", "--short", "HEAD").stdout.strip()
    print("Committed + pushed %d entries at %s" % (len(total), sha))

    for issue, entries in jobs:
        if issue:
            close_issue(issue["number"],
                        "Filed in the AI phone book (%s): %s. Your mix is live on the Mixes page's generator list." %
                        (sha, ", ".join(e["ID"] for e in entries)))
            print("Closed issue #%d." % issue["number"])
    return 0

if __name__ == "__main__":
    sys.exit(main())
