## Summary

<!-- What changes and why. Link the plan in docs/plans/ and the rules (BR-xx) or ADRs it implements. -->

## Decisions

<!-- D-xx decisions made in this change, or "none". -->

## Gate checklist (conventions §22)

- [ ] Plan approved; decisions recorded
- [ ] Typecheck, lint and format pass with zero warnings
- [ ] Tests pass; new behaviour has tests; test count: <!-- n -->
- [ ] Schema changes: migration generated, no drift
- [ ] Boundaries pass; no new cycles
- [ ] OpenAPI and typed client regenerated (if the API changed)
- [ ] Prompt or model changes: new prompt version, evals compared with baseline
- [ ] Write actions go through pending actions and approval
- [ ] No prompts, chat text or personal data in logs; no secrets anywhere
- [ ] No AI attribution in commits, title or description (§3.1)
- [ ] Docs updated in the same change

## Noticed but not fixed

<!-- Anything out of scope worth a follow-up, or "none". -->
