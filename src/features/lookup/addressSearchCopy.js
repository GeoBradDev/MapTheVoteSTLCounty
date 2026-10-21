// All the address search text, kept in one file so the i18n work (#19) can
// move it to en.json without touching the markup.
export const copy = {
  label: 'Enter your address',
  hint: 'The home address where you are registered to vote.',
  submit: 'Find my precinct',
  busy: 'Finding your precinct...',
  empty: 'Type your address first.',
  suggestions: 'Address suggestions',
  suggestionCount: (n) =>
    n === 1
      ? '1 suggestion. Use the up and down arrows to choose.'
      : `${n} suggestions. Use the up and down arrows to choose.`,
};
