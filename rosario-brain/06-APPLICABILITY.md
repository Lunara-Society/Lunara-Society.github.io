# Applicability — does this reach them?

**Live source:** https://lunarasociety.com/corpus/applicability.json

An ordered, first-match-wins decision model for which published obligations reach a given AI deployment. It is marked interpretation, not verified: the obligations it points at are verified, our reading of which one catches you is ours. You are free to accept the facts and reject the reading.

**What it is not:** legal advice, and not a qualifier. Three of the outcomes below conclude that nothing in this corpus binds the asker. A model that only ever escalates is a sales funnel, and it would make every other answer we give worth less.

Marked **interpretation**, not verified. The obligations it points at are
verified; the reading of which one catches someone is ours. Say that. The
person is free to take the facts and leave the reading.

## What you need to know to answer

Every input accepts `unsure`. Ask for what you need; do not assume.

- **interacts_with_people** — Does the system exchange words with a person?
  - *Chat, voice, email replies, a triage assistant. Anything a customer, patient or employee converses with.*
- **generates_content** — Does it produce text, images, audio or video?
  - *Generated rather than retrieved. A drafted summary counts. A generated image counts.*
- **eu_exposure** — Does anyone in the EU use the system, or its output?
  - *The Act binds on output, not on where you are incorporated. An EU customer reading a generated reply is enough.*
- **on_market_before_art50** — Was the system placed on the market before 2 August 2026?
  - *Decides whether the Article 50(2) transitional relief applied to you, and therefore whether its expiry is your nearest deadline.*
- **california_exposure** — Is the system made available to people in California?
- **monthly_users_over_1m** — Does it have more than one million monthly users?
  - *This threshold decides the California Act entirely. Below the line it imposes nothing. Stating the Act without this threshold is a published correction on this site.*
- **hosts_or_distributes_models** — Do you host third-party generative models, or distribute their output at scale?

## The rules, in order — first match wins

1. **NO_OBLIGATION** — when `engages == false AND eu_exposure == 'no'`
   - On these answers, Article 50 does not reach this system.
   - *A system that neither converses nor generates, and whose output no one in the EU uses, sits outside the transparency obligations entirely.*
   - Revisit if: You open an EU market, or you add a generative feature. Either one changes this.

2. **NOT_YET** — when `engages == true AND eu_exposure == 'no'`
   - The system does what Article 50 governs. What it does not do today is reach the European Union.
   - *The Act binds on output rather than on establishment. The day an EU user reads a generated reply, this changes, with no grace period attached.*
   - Revisit if: Any EU user reaches the system or its output.

3. **LIKELY_NO_OBLIGATION** — when `engages == false`
   - A system that neither converses nor generates is not what these obligations were written for.
   - *Article 50 governs disclosure to people and the marking of synthetic output. If a system does neither, the transparency duties are not the relevant ones.*
   - Revisit if: High-risk classification is a separate question under a separate article with its own date. See obligation eu-annex3.

4. **APPLIES** — when `engages == true AND eu_exposure != 'no'`
   - Article 50 reaches this system.
   - *The system engages people or generates content, and its output reaches the European Union.*

## Overlays — these stack on top

- **eu-art50-legacy-overlay** — when `generates_content == 'yes' AND eu_exposure != 'no' AND on_market_before_art50 == 'yes'`
  - The transitional relief under Article 50(2) ends for this system, and that is the nearest binding date in the Act.
  - *Systems placed on the market before Article 50's application date were given transitional relief from the machine-readable marking duty. That relief expires.*
- **ca-sb942-overlay** — when `generates_content == 'yes' AND california_exposure != 'no' AND monthly_users_over_1m == 'yes'`
  - The California AI Transparency Act reaches this system.
  - *The Act reaches generative systems above one million monthly users.*
- **ca-sb942-below-threshold** — when `generates_content == 'yes' AND california_exposure != 'no' AND monthly_users_over_1m == 'no'`
  - The California AI Transparency Act does not reach this system.
  - *The Act reaches generative systems with over one million monthly users. Below that line it imposes nothing. This is the majority of organisations, and saying so is the point of stating the threshold at all.*
- **ca-platforms-overlay** — when `hosts_or_distributes_models == 'yes' AND california_exposure != 'no'`
  - The second wave of AB 853 reaches hosting and distribution, separately from whether you ship a model yourself.
  - *Platforms hosting generative systems, and large online platforms distributing their output, take on their own disclosure and provenance duties.*

## Handling "unsure"

An 'unsure' is never resolved in the direction that manufactures an obligation. Where an input is unsure, the model reports which answer would change the verdict and says so plainly, because guessing is the expensive option and the question is usually answerable in an afternoon by whoever owns the deployment.

## Out of scope for this model

- High-risk classification under Annex III or Annex I. Different article, different dates, not a transparency question.
- Sector regimes untouched by any of this — HIPAA, financial conduct rules, professional duties.
- Whether a given disclosure implementation is adequate. That is an assessment, not a lookup.
