const CURRENT_SAFETY_WAIVER = Object.freeze({
  version: 1,
  title: "Child safety and participation acknowledgement",
  statements: Object.freeze([
    "I confirm that the child's safety, medical, emergency contact, and authorised pickup information is accurate and current.",
    "I consent to the child participating in this class and understand that physical activities may involve ordinary risks.",
    "I authorise the activity partner to use the supplied safety information for class delivery and emergencies.",
    "I agree to follow the activity partner's safety instructions and the booking policies shown above.",
  ]),
});

const getSafetyWaiver = () => ({
  ...CURRENT_SAFETY_WAIVER,
  statements: [...CURRENT_SAFETY_WAIVER.statements],
});

const isCurrentSafetyWaiverAccepted = ({ accepted, version }) =>
  accepted === true && Number(version) === CURRENT_SAFETY_WAIVER.version;

module.exports = {
  CURRENT_SAFETY_WAIVER,
  getSafetyWaiver,
  isCurrentSafetyWaiverAccepted,
};
