## Summary

Closes #

## Checklist

- [ ] Does this change send, store, or log an address, or add an analytics event? If it sends an
      address or coordinates somewhere new, changes what is kept, or adds an analytics event,
      parameter or value (the allowlist in `src/analytics/ga.js`), update the privacy notice
      (`src/features/privacy/privacyCopy.js` and its text in `src/i18n/*.json`) in this PR. Nothing may store or log an address.
- [ ] Voter information comes only from official sources, and the copy stays nonpartisan.
- [ ] `npm run lint`, `npm run format:check`, `npm test` and `npm run build` pass.
