// ─── 30 Comment Reply Templates ─────────────────────────────
// Organized by category. Used by the comment handler for auto-replies.
// The classifier picks a template category, then Claude personalizes it.

export const POSITIVE_TEMPLATES = [
  "We're so glad you loved it! Book your next visit at booking.silvermirror.com ✨",
  "Thanks for the love — we can't wait to see you again! booking.silvermirror.com 💛",
  "That means a lot — thanks for sharing! Members receive 20% off facials and products, learn more at silvermirror.com/memberships ✨",
  "We're thrilled you enjoyed your facial! Want help picking your next treatment? Tell us which location you visit 💛",
  "Yay, thank you! Here's the quickest way to book again: booking.silvermirror.com ✨",
  "So happy to hear that! If you'd like a product recommendation, tell us your skin concern and we'll suggest something 💛",
  "Thanks for stopping by and for the kind words! We'll pass this along to the team ✨",
  "We appreciate you sharing this! Members also get early access to products and perks — details at silvermirror.com/memberships 💛",
  "Love to hear it, thank you! We'd be honored to welcome you back ✨",
  "Thanks for the shout out! If you'd like to tag the esthetician, we'll make sure the team sees it 💛",
];

export const QUESTION_TEMPLATES = [
  "Pricing and options vary by facial type — the full menu is at silvermirror.com/services! Which location are you considering?",
  "You can check real-time availability and book at booking.silvermirror.com! If you want, tell me a preferred date and location and I'll help find a time.",
  "Members receive 20% off Silver Mirror products and facials! Learn more at silvermirror.com/memberships, or email memberships@silvermirror.com for details.",
  "For product questions, please email hello@silvermirror.com or visit shop.silvermirror.com for availability!",
  "Yes, we accept gift cards in-store! If you're having trouble with a gift card, email hello@silvermirror.com with the card details and order number.",
  "For group events, email hello@silvermirror.com with your group size and preferred location, and the events team will follow up!",
  "We recommend the Signature or Esthetician's Choice facial for first-timers! If you tell me your skin concern, I'll recommend a specific treatment.",
  "We're always hiring! View open roles and apply at silvermirror.com/careers ✨",
  "If you're running late, please call your location directly so they can adjust the schedule!",
  "For collaborations, please email Sierra at sierra.case@silvermirror.com with your handle, audience size, and deliverables!",
];

export const COMPLAINT_TEMPLATES = [
  "I'm sorry to hear that — that's not the experience we aim for. Please DM your booking details or call the location, and we'll escalate this to management right away.",
  "We apologize for this. Can you share the location and appointment date so we can investigate? For urgent help, call (888) 677-0055.",
  "Thank you for letting us know — we take this seriously. Someone from our team will follow up within 24-48 hours. Please DM us your details.",
  "I'm sorry this happened. Please DM your name and booking confirmation, or email hello@silvermirror.com. We'll review and respond quickly.",
  "We regret that your visit did not meet expectations. We'd like to make this right — please call the location or email hello@silvermirror.com.",
  "That sounds frustrating, and we're sorry. We'll flag this for manager review — please DM your appointment details.",
  "I'm really sorry to hear that. We'll investigate and reach out. If you prefer immediate help, call (888) 677-0055.",
  "I'm disappointed to read this, and we want to fix it. Please share details or email hello@silvermirror.com so we can follow up with the location manager.",
  "That's not the service we intend. A manager will contact you — please send your preferred phone number or email, or call (888) 677-0055.",
  "I apologize for this experience. We'll open a formal review with the location. Please DM the date and time of your visit.",
];

// Pick a random template from a category
export function getTemplate(category) {
  const templates = {
    positive: POSITIVE_TEMPLATES,
    question: QUESTION_TEMPLATES,
    complaint: COMPLAINT_TEMPLATES,
  };
  const list = templates[category];
  if (!list) return null;
  return list[Math.floor(Math.random() * list.length)];
}
