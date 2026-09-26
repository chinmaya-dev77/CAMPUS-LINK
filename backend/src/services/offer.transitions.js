const transitions = Object.freeze({
    Selected: ['Offer Generated'],
    'Offer Generated': ['Offer Sent'],
    'Offer Sent': ['Pending', 'Accepted', 'Declined'],
    Pending: ['Accepted', 'Declined'],
    Accepted: ['Documentation Pending'],
    'Documentation Pending': ['Documents Verified'],
    'Documents Verified': ['Joining Confirmed'],
    Declined: [],
    'Joining Confirmed': []
});

function canTransition(from, to) {
    return Object.hasOwn(transitions, from) && transitions[from].includes(to);
}

module.exports = { transitions, canTransition };
