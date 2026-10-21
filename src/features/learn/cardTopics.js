// The topics the result cards link to (#23), by id. Each link appears only
// once its topic exists in content/en/learn/ (#22); until then the cards show
// what they did before. Renaming one of these topics means changing it here.

export const CARD_TOPICS = Object.freeze({
  // From the polling places card: what to bring.
  voterId: 'voter-id',
  // From the early voting card: absentee and mail-in voting.
  absentee: 'absentee',
});
