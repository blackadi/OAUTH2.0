# Module 09b — Lab

> **What you will do:** issue a six-claim credential, present two of those claims and nothing else, verify
> the presentation step by step against RFC 9901 §7.1, and then run six attacks against your own verifier.
> One of them succeeds. Then you will read the repo's credential and federation endpoints and diagnose a real
> defect in one of them.

**Most of this lab needs no server and no network.** SD-JWT is pure JOSE, which is exactly why it is the
right thing to learn hands-on. Exercises 7 and 8 are the only ones that touch `:3000`.

---

## Before you start

```bash
# 1. Source your lab environment (Module 00 set this up)
set -a; source docs/curriculum/scripts/curriculum.env; set +a

# 2. A scratch directory — this lab writes key files. Keep them out of the repo.
mkdir -p ~/sd-jwt-lab && cd ~/sd-jwt-lab
export SD="$OLDPWD/docs/curriculum/scripts/sd-jwt.mjs"   # adjust if you started elsewhere
node "$SD"        # should print the usage line
```

> **On the keys you are about to generate.** They are throwaway P-256 keys for a synthetic credential about
> a person who does not exist. They are still private keys: keep them in `~/sd-jwt-lab`, never commit them,
> and delete them at the end (there is a clean-up step).

Read `docs/curriculum/scripts/sd-jwt.mjs` before you run it. It is ~330 lines, has no dependencies, and every
normative requirement it implements is quoted inline with its section number. You are going to attack this
verifier, so it is worth knowing what it checks.

---

## Exercise 1 — The digest, by hand

Before issuing anything, confirm you understand the one computation everything else rests on. RFC 9901
§4.2.3 publishes a test vector: a disclosure for the claim `family_name` with the value `Möbius`.

```bash
node "$SD" digest 'WyJfMjZiYzRMVC1hYzZxMktJNmNCVzVlcyIsICJmYW1pbHlfbmFtZSIsICJNw7ZiaXVzIl0'
```

```
disclosure : WyJfMjZiYzRMVC1hYzZxMktJNmNCVzVlcyIsICJmYW1pbHlfbmFtZSIsICJNw7ZiaXVzIl0
decodes to : ["_26bc4LT-ac6q2KI6cBW5es", "family_name", "Möbius"]
sha-256    : X9yH0Ajrdm1Oij4tWso9UzzKJvPoDxwmuEcO3XAdRC0
```

RFC 9901 §4.2.3 states the expected digest is `X9yH0Ajrdm1Oij4tWso9UzzKJvPoDxwmuEcO3XAdRC0`. **It matches.**
You are now computing digests the same way the spec does, and you have a fixed reference to fall back on if
anything later disagrees.

Three things to notice in that decoded array, because each is a rule:

1. **Three elements, in order** — salt, claim name, claim value (§4.2.1).
2. **The salt comes first**, and it is 128 bits of randomness in base64url (§9.3).
3. **The decoded JSON has a space after each comma.** Remember that. It is the subject of Break 5d.

Now do it the hard way, with no help from the script, to prove the script is not doing anything magic:

```bash
node -e 'const c=require("crypto");process.stdout.write(
  c.createHash("sha256").update(process.argv[1],"ascii").digest("base64url"))' \
  -- 'WyJfMjZiYzRMVC1hYzZxMktJNmNCVzVlcyIsICJmYW1pbHlfbmFtZSIsICJNw7ZiaXVzIl0'
```

```
X9yH0Ajrdm1Oij4tWso9UzzKJvPoDxwmuEcO3XAdRC0
```

Same value. The digest is `base64url(SHA-256(the ASCII bytes of the encoded disclosure string))` — nothing
more.

---

## Exercise 2 — Issue a credential (the issuer role)

Generate two key pairs. The issuer signs the credential; the holder proves possession at presentation time.
They are different parties and must be different keys.

```bash
node "$SD" keygen issuer
node "$SD" keygen holder
```

```
wrote issuer-priv.json (KEEP THIS LOCAL) and issuer-pub.json
wrote holder-priv.json (KEEP THIS LOCAL) and holder-pub.json
```

Define what the credential asserts:

```bash
cat > claims.json <<'EOF'
{
  "vct": "https://credentials.example/identity_card",
  "given_name": "Alice",
  "family_name": "Almasi",
  "birthdate": "1987-03-14",
  "email": "alice@example.com",
  "nationality": "HU",
  "over_18": true
}
EOF
```

Now issue it. Every claim except `vct` is made selectively disclosable, and two decoy digests are added:

```bash
node "$SD" issue --claims claims.json \
  --sd given_name,family_name,birthdate,email,nationality,over_18 \
  --issuer-key issuer-priv.json --holder-key holder-pub.json \
  --iss https://issuer.example --decoys 2 --out cred.sdjwt
```

```
--- Disclosures created (the Issuer sends ALL of these to the Holder) ---
  given_name     WyJQYnNNYzcyODhrbmRvMUJib2w0ZDd3IiwiZ2l2ZW5fbmFtZSIsIkFsaWNlIl0
                 digest=CbqK3d2hVCmxu8b7Anyi5pFtmGK9ooWdwgz9pCfAaMc
  family_name    WyJ3bnJGTHZ6QjNuMmZuODFxTS14dkJRIiwiZmFtaWx5X25hbWUiLCJBbG1hc2kiXQ
                 digest=ikM1NurtDDxFcC2XmnMDTeV4OgJnM_KjXoV76PYffRE
  birthdate      WyJuNWJKV2ZDSVR1NzRNbHJtOUdTZ3h3IiwiYmlydGhkYXRlIiwiMTk4Ny0wMy0xNCJd
                 digest=bCV0UwVWqImBCXEFG4E3A5MObbQ1oetaWIia-I9uVV8
  email          WyJoS3NzTXZURkQ4emkwNFdiSWpZaVBBIiwiZW1haWwiLCJhbGljZUBleGFtcGxlLmNvbSJd
                 digest=XeUBbOYdZrzJTAO85g9tM9a0HieF_AgUCuzuFBzfkiI
  nationality    WyJJZEs0NlhfcEMyTVBLQmt4ZUpOSl9RIiwibmF0aW9uYWxpdHkiLCJIVSJd
                 digest=zDhVIXo2l8OlTacNTpNypp9_w5QDQpkMd5pjQ7ul-sk
  over_18        WyJvbzh5NzA0Z1JWeFowTHNCdElfWTRRIiwib3Zlcl8xOCIsdHJ1ZV0
                 digest=U-No_P9YL9lHIenrICjWQ9EUIDsRV6rlFqb14SEIBE4
  (+2 decoy digest(s) with no Disclosure — §4.2.5)
--- Always-visible claims: vct, iss, iat, cnf
```

> **Your salts and digests will differ from these.** They are random by requirement (§9.3). Everything
> structural — the number of disclosures, which claims stay visible — will match.

Look at the last line. `vct`, `iss`, `iat` and `cnf` are **in the clear**, in every presentation, to every
verifier. That is not an oversight:

- `iss` and `cnf` are on §9.7's list of security-critical claims that an issuer **MUST NOT** make
  selectively disclosable. A verifier that cannot see who issued the credential, or which key the holder must
  prove, cannot verify anything.
- `vct` is what lets a verifier decide whether this *kind* of credential is acceptable for its decision.

Now look at the artefact itself:

```bash
node "$SD" inspect cred.sdjwt | head -30
```

Count the `_sd` array: **eight** digests for **six** disclosable claims. The two extras are decoys (§4.2.5),
and the holder cannot tell them apart from claims it was never given. Neither can a verifier — which is the
point: the digest count no longer reveals how many claims the credential actually contains.

---

## Exercise 3 — Present two claims (the holder role)

Alice is at a bar. The bar needs to know she is over 18 and, for licensing, her nationality. It does not need
her name, birthdate, or email.

```bash
node "$SD" present cred.sdjwt --disclose over_18,nationality \
  --kb-key holder-priv.json --aud https://bar.example --nonce n-8Kd2f \
  --out present.sdjwt
```

Look at exactly what the bar receives:

```bash
node "$SD" inspect present.sdjwt
```

```
=== Disclosures carried (2) ===
  digest=zDhVIXo2l8OlTacNTpNypp9_w5QDQpkMd5pjQ7ul-sk  nationality = "HU"
  digest=U-No_P9YL9lHIenrICjWQ9EUIDsRV6rlFqb14SEIBE4  over_18 = true

=== 6 digest(s) in _sd with NO Disclosure here ===
  (withheld by the Holder, or decoys — you cannot tell which. That is the point.)

=== Key Binding JWT ===
  {"iat":1785235015,"aud":"https://bar.example","nonce":"n-8Kd2f","sd_hash":"P2F2AjeGRLcf2wE_RpINS8G4BKoJAMSpB20_AibY5d0"}
```

**Four disclosures were destroyed on the holder's device and never transmitted.** The bar sees two digests it
can open and six it cannot, and it cannot distinguish "withheld" from "decoy" — so it learns nothing about
how much Alice is holding back.

The issuer's signature is still valid over all of it. That is the trick: the signature covers digests, and
digests are still there.

---

## Exercise 4 — Verify it (the verifier role)

```bash
node "$SD" verify present.sdjwt --issuer-key issuer-pub.json \
  --require-kb --aud https://bar.example --nonce n-8Kd2f
```

```
=== RFC 9901 §7.3 — Verification by the Verifier ===
  ----  7.3/1 Key Binding required by policy? YES  (decided before parsing — §9.5)
  PASS  7.3/2  SD-JWT+KB provided
=== RFC 9901 §7.1 — Verification of the SD-JWT ===
  PASS  7.1/1  split into 1 Issuer-signed JWT + 2 Disclosure(s) + KB-JWT
  PASS  7.1/2a  alg=ES256 ("none" MUST NOT be accepted)
  PASS  7.1/2b  signature over the Issuer-signed JWT (key: issuer-pub.json)
  PASS  7.1/2c  iss=https://issuer.example — you must independently confirm this key belongs to that Issuer
  PASS  7.1/2d  _sd_alg=sha-256
  PASS  7.1/3a  computed 2 digest(s) over the Disclosure strings as received
  PASS  7.1/3c.ii.1  every matched Disclosure is [salt, name, value]
  PASS  7.1/3c.ii.2  no Disclosure claims the name _sd or ...
  PASS  7.1/3c.ii.3  no disclosed claim collides with a plaintext claim
  PASS  7.1/4  no digest appears twice in the payload
  PASS  7.1/5  every Disclosure presented is referenced by a digest
  PASS  7.1/6-exp  no exp in the processed payload
  ----  7.1/6  no --require-claims given: this Verifier demands no validity claims at all (see §9.7)
=== RFC 9901 §7.3/5 — Key Binding JWT ===
  PASS  7.3/5a  Holder public key taken from the cnf.jwk claim of the SD-JWT
  PASS  7.3/5b  KB-JWT alg=ES256
  PASS  7.3/5c  KB-JWT signature verifies against cnf.jwk
  PASS  7.3/5d  typ=kb+jwt (MUST be kb+jwt)
  PASS  7.3/5e  iat=1785235015 (0s old; this tool accepts a 5-minute window)
  PASS  7.3/5f-aud  aud="https://bar.example" vs expected "https://bar.example"
  PASS  7.3/5f-nonce  nonce="n-8Kd2f" vs expected "n-8Kd2f"
  PASS  7.3/5g  sd_hash binds the KB-JWT to these exact Disclosures (expected P2F2AjeGRLcf2wE_…, got P2F2AjeGRLcf2wE_…)

RESULT: ACCEPTED. Processed SD-JWT Payload:
{
  "vct": "https://credentials.example/identity_card",
  "iss": "https://issuer.example",
  "iat": 1785235002,
  "cnf": { "jwk": { … } },
  "over_18": true,
  "nationality": "HU"
}
```

Read the accepted payload once more. **No name. No birthdate. No email.** The bar got a cryptographically
sound answer to exactly the question it asked and to nothing else.

Two lines deserve attention because they are honest about their own limits:

- **`7.1/2c`** — the tool checks that `iss` is *present*. It cannot check that `issuer-pub.json` genuinely
  belongs to `https://issuer.example`; that is a trust decision made out of band, and in a real deployment it
  is exactly what OpenID Federation (or a hardcoded key) is for.
- **`7.1/6`** — this verifier demanded no validity claims. Exercise 5e turns that into an exploit.

---

## Exercise 5 — Break it

Six attacks. Predict the outcome before running each one.

### 5a — Strip the Key Binding JWT

The strongest thing in this presentation is the holder's proof of possession. It is also the last `~`
-separated element, so an attacker who intercepts the presentation can simply delete it.

```bash
# Cut everything after the last tilde: turn an SD-JWT+KB back into a bare SD-JWT
python3 -c "s=open('present.sdjwt').read(); open('stripped.sdjwt','w').write(s.rsplit('~',1)[0]+'~')"

node "$SD" verify stripped.sdjwt --issuer-key issuer-pub.json \
  --require-kb --aud https://bar.example --nonce n-8Kd2f
```

```
  ----  7.3/1 Key Binding required by policy? YES  (decided before parsing — §9.5)
  FAIL  7.3/2  Key Binding required but a bare SD-JWT was presented — REJECT

RESULT: REJECTED.
```

Good. Now run **the same stolen file** against a verifier whose policy does not require key binding:

```bash
node "$SD" verify stripped.sdjwt --issuer-key issuer-pub.json
```

```
RESULT: ACCEPTED. Processed SD-JWT Payload:
{ … "over_18": true, "nationality": "HU" }
```

**Accepted.** The attacker did not break any cryptography. They deleted 200 bytes and found a verifier with a
weaker policy.

This is why §7.3/1 says the key-binding decision *"MUST NOT be based on whether or not a Key Binding JWT is
provided by the Holder"*, and why §9.5 spells out the consequence: *"otherwise, an attacker could strip the
KB-JWT from an SD-JWT+KB and present the resultant SD-JWT."* A verifier that writes
`if (kbJwtPresent) checkKeyBinding()` has written an `if` statement the attacker controls.

> **Carry this one into Module 10.** It is the same structural error as accepting `alg: none` (Module 08) or
> letting the request choose its own security level (Module 05): **the input decided the policy.**

### 5b — Replay the presentation at a different verifier

Alice presented to `https://bar.example`. A malicious bar replays that exact presentation at a casino:

```bash
node "$SD" verify present.sdjwt --issuer-key issuer-pub.json \
  --require-kb --aud https://casino.example --nonce n-8Kd2f
```

```
  FAIL  7.3/5f-aud  aud="https://bar.example" vs expected "https://casino.example"
RESULT: REJECTED.
```

The `aud` claim inside the KB-JWT is signed by the holder, so the bar cannot rewrite it. Note the
precondition: this only works because the casino **checked**. Drop `--aud` and the tool warns you that a real
verifier MUST check it — and accepts.

### 5c — Forge a disclosure

Alice's nationality is `HU`. Change it to `US` without touching the issuer's signature:

```bash
python3 - <<'EOF'
import base64, json
b64u = lambda b: base64.urlsafe_b64encode(b).decode().rstrip('=')
unb64u = lambda s: base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))
s = open('present.sdjwt').read().split('~')
for i, p in enumerate(s[1:-1], 1):
    a = json.loads(unb64u(p))
    if len(a) == 3 and a[1] == 'nationality':
        a[2] = 'US'
        s[i] = b64u(json.dumps(a, separators=(',', ':')).encode())
        print("forged:", json.dumps(a))
open('forged.sdjwt', 'w').write('~'.join(s))
EOF

node "$SD" verify forged.sdjwt --issuer-key issuer-pub.json --require-kb \
  --aud https://bar.example --nonce n-8Kd2f
```

```
forged: ["IdK46X_pC2MPKBkxeJNJ_Q", "nationality", "US"]
  FAIL  7.1/5  1 Disclosure(s) not referenced by any digest — REJECT
```

Note **which** check caught it, because it is not the obvious one. The issuer's signature still verifies
perfectly — the attacker never touched the JWT. What failed is §7.1/5: the forged disclosure hashes to
something that appears nowhere in `_sd`, so it is an orphan.

A verifier that decodes disclosures and reads their values — the naïve implementation from the lesson's
common-mistakes section — has no step that would catch this. It would report Alice as American.

### 5d — Change nothing but the whitespace

This one surprises people. Take a disclosure and re-serialize it with different JSON spacing. The salt is
unchanged, the claim name is unchanged, **the value is unchanged**:

```bash
python3 - <<'EOF'
import base64, json
b64u = lambda b: base64.urlsafe_b64encode(b).decode().rstrip('=')
unb64u = lambda s: base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))
s = open('present.sdjwt').read().split('~')
for i, p in enumerate(s[1:-1], 1):
    a = json.loads(unb64u(p))
    if len(a) == 3 and a[1] == 'over_18':
        s[i] = b64u(json.dumps(a, separators=(', ', ': ')).encode())
        print("re-serialized, identical value:", json.dumps(a, separators=(', ', ': ')))
open('reser.sdjwt', 'w').write('~'.join(s))
EOF

node "$SD" verify reser.sdjwt --issuer-key issuer-pub.json
```

```
re-serialized, identical value: ["oo8y704gRVxZ0LsBtI_Y4Q", "over_18", true]
  FAIL  7.1/5  1 Disclosure(s) not referenced by any digest — REJECT
```

Rejected, for a semantically identical disclosure. This is §4.2.3 doing exactly what it says: the digest is
computed *"over the US-ASCII bytes of the base64url-encoded value that is the Disclosure."*

**This is a bug generator, not just a curiosity.** Any implementation that parses a disclosure into a
language object and re-encodes it before hashing — a perfectly natural thing to write — will produce wrong
digests for every credential it did not itself create. The rule is: **treat a disclosure as an opaque string
from the moment you receive it.** Decode it to read the value; never to re-encode it.

### 5d-bis — Delete one character

Not a forgery. Not a replay. **Remove the final `~`** and see what a verifier does with a credential that is
merely *malformed*:

```bash
node sd-jwt.mjs issue --claims claims.json \
  --sd given_name,family_name,email,nationality --issuer-key i-priv.json --out ok.txt
perl -pe 's/~$//' ok.txt > notilde.txt
node sd-jwt.mjs verify notilde.txt --issuer-key i-pub.json
```

```
  FAIL  7.1/1  MALFORMED — the final element "WyJqX2VLV2xaVUJzMlN4aF9V…" is not a JWS (no "."), so it is
               a Disclosure and the trailing "~" was omitted. §4: with no KB-JWT the last element MUST be
               an empty string and the last separating tilde MUST NOT be omitted
RESULT: REJECTED.
```

**Until 2026-08-14 this script printed `RESULT: ACCEPTED`** — and `nationality` was simply gone from the
processed payload. Work through why, because the failure is more interesting than the fix:

`splitSdJwt` decided whether a KB-JWT was present by asking *"is the final `~`-separated element non-empty?"*
Strip the tilde and the last **Disclosure** becomes the final non-empty element, so it was reclassified as a
Key Binding JWT and removed from the Disclosure list. Then **every subsequent step passed honestly**:
`7.1/5` — *"every Disclosure presented is referenced by a digest"* — passed because the three *surviving*
Disclosures genuinely were all referenced. The fourth had been discarded before counting began. And `7.1/1`,
the step whose entire job is *"separate the SD-JWT into its parts"*, was **hardcoded `PASS`**.

Three things to take away:

1. **A step that cannot fail is not a check.** `step('7.1/1', true, …)` looked like verification in the output
   trace and verified nothing. Read your own PASS lines and ask which of them could ever print FAIL.
2. **Silently discarding data is worse than rejecting it.** A verifier that says "no" is a bug report. A
   verifier that says "yes" while dropping a claim is a *security* bug — the application downstream sees a
   credential that the holder never presented, and nothing anywhere says so.
3. **The fix had to be structural, not a guess.** "Assume a KB-JWT if it looks long" would be a heuristic. A
   KB-JWT is a JWS — three base64url segments, **two dots**. A Disclosure is base64url of a JSON array and
   contains **no** dot. So a non-empty final element with no dots *cannot* be a KB-JWT, and the omitted tilde
   becomes detectable rather than merely suspected. When you enforce a format rule, find the property that
   makes the two cases distinguishable in principle.

`AUDIT-PASS-A.md` recorded this script as *"CLEAN, 0 defects"*. It had three, and this was the one with a
security consequence.

### 5e — The `exp` that was never disclosed

§9.7 warns that issuers **MUST NOT** make validity-critical claims selectively disclosable. Build a credential
that violates the rule, then exploit it. Note the `exp` is set **one hour in the past** — this credential is
already expired at the moment it is issued:

```bash
python3 -c "
import json, time
c = json.load(open('claims.json')); c['exp'] = int(time.time()) - 3600
json.dump(c, open('claims-exp.json','w'))"

node "$SD" issue --claims claims-exp.json --sd given_name,exp \
  --issuer-key issuer-priv.json --iss https://issuer.example --out expcred.sdjwt

# The holder simply does not forward the exp Disclosure.
node "$SD" present expcred.sdjwt --disclose given_name > exppres.sdjwt
node "$SD" verify exppres.sdjwt --issuer-key issuer-pub.json
```

```
  PASS  7.1/6-exp  no exp in the processed payload
  ----  7.1/6  no --require-claims given: this Verifier demands no validity claims at all (see §9.7)

RESULT: ACCEPTED.
{ "iss": "https://issuer.example", "given_name": "Alice" }
```

**An hour-expired credential, accepted.** The holder did not forge anything — they exercised selective
disclosure exactly as designed, on a claim the issuer should never have made optional.

Confirm the credential really is expired by disclosing `exp` as well:

```bash
node "$SD" present expcred.sdjwt --disclose given_name,exp | node "$SD" verify - --issuer-key issuer-pub.json
```

```
  FAIL  7.1/6-exp  exp=1785231459 has passed — REJECT
```

Now the defence. §9.7 requires the verifier to *"ensure that all claims they deem necessary for checking the
validity of an SD-JWT in the given context are present (or disclosed, respectively)"* — because it *"cannot
reliably depend on"* the issuer having done the right thing:

```bash
node "$SD" verify exppres.sdjwt --issuer-key issuer-pub.json --require-claims exp
```

```
  FAIL  7.1/6-req  required validity claim "exp" is MISSING from the processed payload — REJECT (§9.7)
```

The verifier states its requirements up front, and **absence becomes a failure rather than a silent pass.**
That inversion is the whole lesson: in a selective-disclosure world, *a missing claim is an active event*,
not a default.

### 5f — Reason about this one without running it

An issuer builds `_sd` by digesting each claim, but has a bug: for two claims with the same value it reuses
the same salt. Both claims therefore produce the **same digest**, which appears twice in `_sd`.

Write down: (a) which numbered §7.1 step rejects this, (b) what a verifier that skipped that step would
compute, and (c) which §9.3 requirement the issuer violated. Then check yourself against the quiz.

---

## Exercise 6 — The unlinkability you cannot have

Alice presents to two different verifiers, disclosing **completely disjoint** claims:

```bash
node "$SD" present cred.sdjwt --disclose over_18 \
  --kb-key holder-priv.json --aud https://bar.example  --nonce n-111 > p-bar.sdjwt
node "$SD" present cred.sdjwt --disclose nationality \
  --kb-key holder-priv.json --aud https://shop.example --nonce n-222 > p-shop.sdjwt
```

The bar learns only `over_18`. The shop learns only `nationality`. No shared claim value. Now suppose the two
collude — or suffer a breach — and compare notes:

```bash
echo -n "Issuer-signed JWT identical? "
[ "$(cut -d'~' -f1 p-bar.sdjwt)" = "$(cut -d'~' -f1 p-shop.sdjwt)" ] && echo "YES — byte-for-byte" || echo "no"
cut -d'~' -f1 p-bar.sdjwt | tr -d '\n' | sha256sum | cut -c1-32
```

```
Issuer-signed JWT identical? YES — byte-for-byte
d98c1fdb050413b538407cb653bd02cb
```

**One shared string links the two presentations perfectly.** The `cnf.jwk` holder key is identical too. Alice
disclosed nothing in common and is still trivially correlated.

This is §10.1's *Verifier/Verifier Unlinkability* failing, and it is the default behaviour, not a
misconfiguration. The mitigation — batch issuance of many single-use credentials, each with its own holder
key and salts — is an operational cost that someone has to choose to pay.

And one property is not available at any price. §10.1:

> "Issuer/Verifier unlinkability with a careless, colluding, compromised, or coerced Verifier cannot be
> achieved in salted hash-based selective disclosure approaches, such as SD-JWT, as the issued credential
> with the Issuer's signature is directly presented to the Verifier, who can forward it to the Issuer."

**Say this out loud in your own words before moving on.** If a vendor claims their SD-JWT-based wallet gives
issuer/verifier unlinkability against a coerced verifier, they are wrong, and the RFC says so.

---

## Exercise 7 — The repo's credential endpoints

Now to the server. Start it if it is not running (`npm --prefix server run dev`).

This repo implements nine OID4VCI endpoints, and **verifiable credentials are now enabled on the Authlete
service** — so this exercise is about a distinction you cannot see when a feature is simply off:

> **Enabling a feature is not the same as configuring it.**

The flag is on. The issuer metadata document is real and conformant. And two of the three discovery endpoints
still fail — for a completely different reason than they used to. Reading refusals precisely is the skill this
curriculum keeps drilling, and this is the version of the exercise where precision actually pays.

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  "$AS/.well-known/openid-credential-issuer"

for p in metadata jwtissuer jwks; do
  printf '%-10s ' "$p"
  curl -s "$API/vci/$p" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('resultCode') or '(document, no resultCode)','|',d.get('action') or '')"
done
```

```
200 application/json; charset=utf-8
metadata   (document, no resultCode) | 
jwtissuer  A417202 | INTERNAL_SERVER_ERROR
jwks       A403201 | INTERNAL_SERVER_ERROR
```

Note the loop had to change to read this. The old version printed `d['resultCode']` unconditionally, because
every endpoint used to return an Authlete *error envelope*. **`metadata` now returns a document instead**, and
a document has no `resultCode` — so the old one-liner raises `KeyError`. When a feature comes on, the shape of
the answer changes, not just its status.

Look at what `metadata` actually returns:

```bash
curl -s "$API/vci/metadata" | python3 -m json.tool | head -12
```

```json
{
    "credential_issuer": "https://oauth2-0-ekh2.onrender.com",
    "credential_endpoint": "https://oauth2-0-ekh2.onrender.com/api/vci/credential/issue",
    "batch_credential_endpoint": "https://oauth2-0-ekh2.onrender.com/api/vci/credential/batch",
    "deferred_credential_endpoint": "https://oauth2-0-ekh2.onrender.com/api/vci/deferred/issue",
    "credential_configurations_supported": {
        "IdentityCredential": {
            "format": "vc+sd-jwt",
            "vct": "https://credentials.example.com/identity_credential",
```

That is OID4VCI 1.0 §12.2.4's document, with all three REQUIRED members present — `credential_issuer`,
`credential_endpoint` and `credential_configurations_supported` — and **snake_case throughout**, because this
is a specification-defined document rather than Authlete's internal envelope. Hold onto that contrast; it is
the subject of Exercise 8.

Now read the two failures, because their result codes say exactly what is missing:

```bash
curl -s "$API/vci/jwks" -w '\n[%{http_code}]\n'
```

```
{"resultCode":"A403201","resultMessage":"[A403201] The JWK Set document of the credential issuer has not been set up yet.","action":"INTERNAL_SERVER_ERROR", …}
[500]
```

`jwtissuer` fails for the same root cause and says so differently: `[A417202] The JWT issuer metadata is not
available because **neither the JWK Set document of the credential issuer nor its URL** has been set up.`

**A credential issuer signs credentials.** Turning the feature on gave it endpoints and a metadata document;
it did not give it a signing key. Until `credentialJwks` (or `credentialJwksUri`) is set on the service, there
is nothing to publish at `/vci/jwks` and nothing to describe at `/vci/jwtissuer`. The metadata document
survives because it describes *what the issuer offers*, which needs no key.

Offers need admin credentials — they mint issuance state, so they are in the admin tier
(`AGENTS.md`, VCI auth category 2). `MGMT_CLIENT_ID` and `MGMT_CLIENT_SECRET` are the two values from your own
`server/.env`; export them into your shell first, or paste them into the `-u` argument. Try it both ways:

```bash
# no credentials
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"credentialConfigurationIds":["IdentityCredential"]}' \
  "$API/vci/offer/create" -w '\n[%{http_code}]\n'

# with them
curl -s -X POST -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -H 'Content-Type: application/json' \
  -d '{"credentialConfigurationIds":["IdentityCredential"],"subject":"admin"}' \
  "$API/vci/offer/create" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['resultCode'],'|',d['action'],'|',d['resultMessage'])"
```

```
{"error":"invalid_client","error_description":"Client authentication required"}
[401]

A366001 | CREATED | [A366001] A credential offer was created successfully.
```

Four observations worth writing down:

1. **Two different result codes, one root cause, and neither is the one you would guess.** `A403201` and
   `A417202` both mean "the credential issuer has no JWK Set", but each names the specific document it could
   not produce. That precision is what makes Authlete error codes worth reading rather than pattern-matching
   on the HTTP status — and it is why the codes changed when the flag did. They used to be `A364301` /
   `A416301` / `A402301`, all `NOT_FOUND`, all meaning *"VCI is off"*. **Same endpoints, same failure status
   class, entirely different diagnosis.**
2. **`NOT_FOUND` → `INTERNAL_SERVER_ERROR` is the honest transition.** With the feature off, the document does
   not exist and 404 is correct. With the feature on and its key material missing, the document *should*
   exist and cannot be built — which is a server fault, not a missing resource. Authlete gets this right, and
   most implementations would have kept returning 404.
3. **`offer/create` refuses locally before Authlete is consulted**, with an OAuth-shaped
   `invalid_client` rather than a vendor envelope. That gate **fails closed**: if `MGMT_CLIENT_ID` or
   `MGMT_CLIENT_SECRET` is unset, it returns 401 rather than allowing the request through.
4. **Some validation happens before Authlete is consulted.** All three credential endpoints refuse an
   unauthenticated caller locally, without a round trip:

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{}' "$API/vci/credential/issue"  -w ' [%{http_code}]\n'
curl -s -X POST -H 'Content-Type: application/json' -d '{}' "$API/vci/credential/batch"  -w ' [%{http_code}]\n'
curl -s -X POST -H 'Content-Type: application/json' -d '{}' "$API/vci/deferred/issue"    -w ' [%{http_code}]\n'
```

```
{"error":"invalid_token","error_description":"Access token is required. Provide via Authorization: Bearer header or accessToken field in body."} [401]
{"error":"invalid_token","error_description":"Access token is required. Provide via Authorization: Bearer header or accessToken field in body."} [401]
{"error":"invalid_token","error_description":"Access token is required. Provide via Authorization: Bearer header or accessToken field in body."} [401]
```

Local checks, clean OAuth-shaped errors, no Authlete round trip. That layering is correct and worth noticing
— it is what the federation endpoint in the next exercise fails to do.

### Why all three agree, and what it cost to make them

**Until 2026-08-13 the third line was different**, and the difference was a security defect rather than a
style inconsistency. `deferred/issue` answered:

```
{"error":"invalid_request","error_description":"Missing order with transactionId for deferred credential retrieval."} [400]
```

It was complaining about the **order**, because it never looked for a token at all. Supply a `transactionId`
and it issued a credential — to anyone. A `transaction_id` is a *handle*, not a credential: OID4VCI §9.1 makes
it REQUIRED so the wallet can name which pending request it is collecting, and it is not evidence of who is
asking.

**Three things about how this was found are worth more than the fix.**

**It was found by asking a question, not by reading code.** `node scripts/check-route-coverage.mjs --triage`
answers *"which routes does no test mention?"*. This endpoint had a unit-tested controller and **nothing
driving the route** — and a controller test calls the handler directly, so it can never see a missing gate.
The endpoint's two siblings were already correct, so nothing looked wrong in isolation. **The asymmetry was
the bug**, and you only see an asymmetry by looking at the set.

**The documentation asserted the control that was missing.** Both `AGENTS.md` and the server's own route index
described this endpoint as *"requires Bearer token"*. Neither was true. When you audit, a claim in the docs is
a hypothesis to test, never evidence — Module 07's template makes this point and here is a live instance.

**The vendor's API shape is why it happened.** Look at what each Authlete API accepts:

| Authlete API | Takes | Where the token is checked |
|---|---|---|
| `/vci/single/issue` | `accessToken` **+** `order` | on that call |
| `/vci/batch/issue` | `accessToken` **+** `orders` | on that call |
| `/vci/deferred/issue` | `order` **only** | nowhere — there is no field for it |
| `/vci/deferred/parse` | `accessToken` + `requestContent` | **here, and only here** |

Two endpoints could be written the obvious way and be safe. The third could not, because Authlete splits
authentication (`parse`) away from the operation (`issue`) on the deferred path only. Writing it by analogy
with its siblings produced an endpoint that looked complete and authenticated nobody.

So the fixed handler makes **two** calls, and takes `requestIdentifier` from `parse`'s answer rather than from
the request body — otherwise any valid token could name any pending request. Same rule you met in Module 04:
**a field the server can determine must not be readable from the client.**

**Verify it yourself — the control is now observable.** With verifiable credentials enabled, present a token
that does not exist and watch which of the two calls answers:

```bash
curl -s -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer bogus' \
  -d '{"order":{"transactionId":"anything"}}' "$API/vci/deferred/issue" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['resultCode'],'|',d['action'])"
```

```
A375304 | UNAUTHORIZED
```

`[A375304] The access token does not exist.` — and it is **`parse`** that said so, because `issue` has no
field to check a token with. Three things are proved at once by that one line: the endpoint is live rather
than refusing for configuration reasons; the deferred path really does validate the access token, which is
the entire control this fix added; and the `requestContent` this server synthesises is accepted, since
Authlete parsed it far enough to *reach* token validation. Before the flag went on, this was marked
`UNVERIFIED` and rested on mocked tests alone.

> **`UNVERIFIED` — issuing an actual credential.** Everything above is real. What is still not runnable here
> is the *end* of the flow: a wallet obtaining an access token against the offer and receiving a signed
> credential. That needs the credential issuer's JWK Set, which is exactly what `A403201` and `A417202` above
> say is missing — so the same gap blocks `/vci/jwks` and blocks issuance, and you can see it in both places.

> **A note on the auth model, and two corrections this lab has to make about itself.** Both are worth more
> than the facts they correct, because they are the two ways a lab goes stale.
>
> **First: it once showed an unauthenticated call reaching Authlete.** An earlier version of this exercise
> printed a `403` from `/vci/offer/create` sent with *no credentials at all* — which contradicts `AGENTS.md`
> putting the offer endpoints behind admin Basic auth. Both were accurate when written, because
> **`require-basic-auth.ts` returned *allow* if `MGMT_CLIENT_ID` / `MGMT_CLIENT_SECRET` were unset.**
> Fail-open: an omitted configuration value silently disabled authentication on every admin route, including
> one that returns a confidential client's secret in plaintext. This lab described that as *"documented,
> intentional, developer-convenience behaviour"* — exactly the sentence a reader should distrust.
>
> **It fails closed now**, which is why the run above answers `401 invalid_client` without credentials. The
> 401 body is deliberately identical to the wrong-password one, because telling an anonymous caller that admin
> auth is misconfigured is free reconnaissance. Keep the shape in your Module 07 audit template:
> **fail-open on a missing configuration value** is the pattern, and the reason it survived so long is that
> nothing *looked* wrong — the calls succeeded, the tests passed, and a lab wrote it down as intentional.
>
> **Second: the transcripts in this exercise were rewritten on 2026-08-14** because a configuration change
> invalidated them. Enabling verifiable credentials turned four outputs into four different outputs, and
> nothing in the build, the tests or `check-docs.mjs` could have noticed — **labs are prose.** The repo's
> standing rule is *"grep the curriculum for the symptom you changed"*, and it would not have fired here:
> the symptom was a **service flag**, not an error string, so there was no string to grep for. When you change
> a flag, the search term is the *behaviour* it gated, and the place to look is every transcript that shows
> that behaviour refusing.

---

## Exercise 8 — Diagnose the federation endpoint

The repo serves an OpenID Federation entity configuration at the spec's well-known path. Try it:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "$AS/.well-known/openid-federation"
curl -s "$API/federation/configuration" -w '\n[%{http_code}]\n' | head -c 300
```

```
400 text/html; charset=utf-8
{"error":"Bad Request","message":"API error occurred: {\"resultCode\":\"A126203\",\"resultMessage\":\"[A126203] The request body is missing or empty.\",…
[400]
```

Stop and read that. It is wrong in three separate ways, and your job is to say which layer owns each.

**First: the error is not an OAuth or federation error at all.** It is an unhandled SDK `ResultError` that
fell through to the generic error handler. Check what else came with it:

```bash
curl -s "$API/federation/configuration" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('keys        :', list(d.keys()))
print('stack?      :', 'stack' in d)
print('leaks paths?:', '/home/' in d.get('stack',''))"
```

```
keys        : ['error', 'message', 'stack']
stack?      : True
leaks paths?: True
```

A stack trace with absolute filesystem paths, returned to an unauthenticated caller on a **public discovery
endpoint**.

**Second: `[A126203] The request body is missing or empty` is a complaint about the request *this server*
made to Authlete** — not about anything the caller did. The caller sent a perfectly good `GET`.

**Third: it misreports the cause.** Find out what is really wrong by asking Authlete directly, with a body
this time. (This reads `AUTHLETE_BEARER_TOKEN` from `server/.env` — the same technique Module 06 used to
prove where a fault lives. Do not paste the token anywhere.)

```bash
set -a; . ./server/.env; set +a
curl -s -X POST -H "Authorization: Bearer $AUTHLETE_BEARER_TOKEN" \
  -H "Content-Type: application/json" -d '{}' \
  "$AUTHLETE_BASE_URL/api/$AUTHLETE_SERVICE_ID/federation/configuration" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['resultCode'],'|',d['resultMessage'])"
```

```
A316201 | [A316201] Because a JWK Set for federation has not been set up, this service cannot generate entity configuration.
```

**Two different faults, stacked.** The service genuinely is not configured for federation (`A316201`) — but
you cannot see that through the repo's endpoint, because the request never gets far enough to be told.

Now find the code fault:

```bash
grep -n "federation.configuration" server/src/services/federation.service.ts
grep -n "RequestBody\|requestBody" \
  server/node_modules/@authlete/typescript-sdk/src/models/operations/federationconfigurationapi.ts | head -3
```

```
12:    log("FederationService.configuration: calling Authlete federation configuration API");
14:    const response = await this.authleteApi.federation.configuration({
8:export type FederationConfigurationApiRequestBody = {};
15:  requestBody?: FederationConfigurationApiRequestBody | undefined;
```

There it is. The SDK types `requestBody` as **optional**, so omitting it compiles cleanly and passes review —
but Authlete requires a body, even an empty one. The call sends none, Authlete rejects it at the outermost
check, and the real diagnosis never surfaces.

**Write the finding up yourself** before reading the summary below. Use the Module 07 format: statement,
evidence, severity with reachability, remediation.

<details>
<summary>Compare with mine</summary>

**Finding: the OpenID Federation entity-configuration endpoint cannot work, and misreports why.**

*Evidence.* `GET /.well-known/openid-federation` and `GET /api/federation/configuration` both return HTTP 400
with `[A126203] The request body is missing or empty`. `federation.service.ts:14` calls
`authleteApi.federation.configuration({ serviceId })` with no `requestBody`; the SDK types that field as
optional. A direct call to Authlete with `{}` returns HTTP 200 and the real diagnosis, `[A316201] Because a
JWK Set for federation has not been set up`.

*Severity.* Availability: **high, fully reachable** — the endpoint is unauthenticated, public, and 100%
broken, so no federation peer can ever fetch this entity's configuration. Confidentiality: **low–moderate** —
the response includes a stack trace with absolute filesystem paths and internal module structure on a public
endpoint. Integrity: none.

*Remediation.* Two independent changes, in order: (1) pass `requestBody: {}` on the SDK call — one line;
(2) handle the `NOT_FOUND` / `INTERNAL_SERVER_ERROR` actions and return a federation-shaped error instead of
letting a `ResultError` reach the generic handler. Separately, suppress `stack` in error responses on public
routes. Then configure a federation JWK Set on the service, which is what `A316201` is actually asking for.

*Note the shape.* This is the third instance in this curriculum of the same defect class — Module 08's
back-channel logout blamed *"Invalid logout token"* for an unset `JWKS_URI`, and Module 06's token exchange
reported a Zod failure as `"Bad Request"`. **A server configuration error reported as a caller error costs
the operator hours, every time.**
</details>

For contrast, the *other* federation endpoint is written correctly:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"entityConfiguration":"not.a.jwt"}' "$API/federation/registration" -w '\n[%{http_code}]\n'
curl -s -X POST -H 'Content-Type: application/json' -d '{}' "$API/federation/registration"
```

```
{"error":"federation_error","error_description":"{\"error\":\"invalid_request\",\"error_description\":\"[A345302] The presented entity configuration failed to be parsed: Invalid entity statement: Invalid JWS header: Invalid JSON object\"}"}
[400]
{"error":"invalid_request","error_description":"Missing required field: entityConfiguration or trustChain"}
```

Local validation first, then a typed `federation_error` envelope, no stack trace. Same file, same service,
two endpoints, one correct. Worth knowing that the difference is one missing argument.

---

## Break it — two to reason about, not run

1. **A verifier caches issuer public keys by `iss` for 24 hours to avoid fetching JWKS on every
   presentation.** In OAuth this is routine. Name two things that are worse about it here, given that the
   issuer is offline at presentation time and credentials may be long-lived.

2. **An age-verification service stores every presentation it receives for audit, for seven years.** Using
   §10.1 and §10.2, describe the privacy harm concretely — what becomes possible after a breach that was not
   possible before — and state the minimum change that removes most of it.

---

## Verification block

Tick each only if you ran it and saw it:

- [ ] The RFC 9901 §4.2.3 test-vector digest reproduced **exactly**, twice — once with the script, once with
      `openssl`
- [ ] A six-claim credential issued; `_sd` holds **eight** digests (six claims + two decoys)
- [ ] A presentation carrying **two** disclosures verified with all §7.1 and §7.3/5 steps PASS
- [ ] The processed payload contains **no** name, birthdate, or email
- [ ] KB-JWT stripped → **rejected** by the strict verifier and **accepted** by the permissive one
- [ ] Cross-verifier replay caught by `aud`
- [ ] A forged disclosure rejected at **§7.1/5**, not at the signature check
- [ ] A whitespace-only re-serialization rejected — same value, different digest
- [ ] An expired credential accepted with `exp` withheld, then rejected via `--require-claims exp`
- [ ] Two presentations with disjoint claims shown to share a **byte-identical** issuer-signed JWT
- [ ] A conformant OID4VCI §12.2.4 metadata document read, and the **two** remaining refusal codes
      (`A403201`, `A417202`) traced to the one thing the enabled feature still lacks
- [ ] `A375304` obtained from `deferred/issue` with a bogus token — proving which of its **two** Authlete calls
      checks the token
- [ ] The federation endpoint's real cause (`A316201`) obtained, and the one-line code fault located

If any is unticked, do not move to Module 10 — every one of these is load-bearing for the FAPI attacker
model.

---

## Clean up

```bash
cd ~ && rm -rf ~/sd-jwt-lab      # removes the throwaway private keys
```

The credential was synthetic and the keys were disposable, but delete them anyway — building the habit costs
nothing.

---

## What to carry into Module 10

Three things:

1. **The input must never decide the policy.** KB stripping (5a) works only against a verifier that inferred
   its requirements from the message. Module 10's FAPI 2.0 attacker model is, in large part, a systematic
   answer to that class of error.
2. **A missing claim is an event.** Selective disclosure makes absence normal, so "I did not see it" can no
   longer mean "it was fine" (5e). FAPI takes the same line about required parameters.
3. **Some properties are unachievable, and a good spec says so.** RFC 9901 §10.1 states plainly which
   unlinkability it cannot deliver. Module 10 opens with a spec that does the same thing at the level of a
   whole profile — an explicit, published attacker model that says what is in scope and what is not.
