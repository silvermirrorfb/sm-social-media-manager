import { CONTACTS, findLocation } from './routing';

const BOOKING_URL = 'https://booking.silvermirror.com/booking/location';
const SERVICES_URL = 'https://silvermirror.com/services';
const MEMBERSHIP_URL = 'https://silvermirror.com/memberships';
const CAREERS_URL = 'https://silvermirror.com/careers/';
const SHOP_URL = 'https://shop.silvermirror.com';
const GIFT_CARD_URL = 'https://booking.silvermirror.com/giftcards';
const GENERAL_PHONE = '(888) 677-0055';

function normalize(text) {
  return String(text || '').trim().toLowerCase();
}

function pickVariant(seedText, options) {
  if (!Array.isArray(options) || options.length === 0) return '';
  const seed = String(seedText || '');
  const hash = seed
    .split('')
    .reduce((acc, char, index) => (acc + char.charCodeAt(0) * (index + 1)) % 10007, 0);
  return options[hash % options.length];
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function getLocationLine(location) {
  if (!location) return '';
  return ` ${location.name}: ${location.phone}.`;
}

function getSkinConcernReply(text) {
  if (/(acne|breakout|breakouts|blemish)/.test(text)) {
    return `For acne or breakouts, the Acne-Fighting Facial is usually the best fit. If you want something more customized, Esthetician's Choice is also a great option. You can book here: ${BOOKING_URL}`;
  }

  if (/(anti.?aging|wrinkle|fine lines|firming)/.test(text)) {
    return `For anti-aging concerns, the Anti-Aging Facial is our most popular option. If you'd like, you can book here: ${BOOKING_URL}`;
  }

  if (/(sensitive|rosacea|reactive)/.test(text)) {
    return `For sensitive or reactive skin, the Sensitive Skin Facial is usually the best place to start. You can book here: ${BOOKING_URL}`;
  }

  if (/(pregnan|postpartum|breastfeeding|nursing)/.test(text)) {
    return 'Yes. Our pregnancy-safe options are the Sensitive Skin Facial (50 min), Signature Facial (30 min), and Lymphatic Facial (30 min). Just let your esthetician know at check-in.';
  }

  if (/(dark spot|hyperpigment|pigment|dull|glow|brightening)/.test(text)) {
    return `For dullness or hyperpigmentation, the Brightening Facial is usually the best fit. Esthetician's Choice is also great if you want a more customized plan. Book here: ${BOOKING_URL}`;
  }

  if (/(first time|first-time|new here|never had a facial)/.test(text)) {
    return `If it's your first time, I'd usually recommend the Signature Facial (30 min) or Esthetician's Choice (50 min). If you want, I can help narrow it down based on your skin goals.`;
  }

  if (/(clogged|congestion|congested|pores|deep clean)/.test(text)) {
    return `For congestion or a deeper clean, the Deep Pore Cleansing Facial is a great pick. You can check the full menu here: ${SERVICES_URL}`;
  }

  return null;
}

export function getSmartDMResponse(messageText) {
  const text = normalize(messageText);
  const location = findLocation(text);
  const skinConcernReply = getSkinConcernReply(text);

  if (!text) return null;

  if (/^(hi|hey|hello|yo|good morning|good afternoon|good evening)[!. ]*$/.test(text)) {
    return pickVariant(text, [
      'Hey! Thanks for reaching out to Silver Mirror ✨ What can I help with?',
      'Hi there! So glad you messaged us. What can I help you with today?',
      'Hey! Happy to help. What are you looking for?',
    ]);
  }

  if (hasAny(text, [/(botox|filler|injectable|waxing|massage|laser|microblading|lash)/])) {
    return `We're focused on expert-driven facials, so we don't offer that service. If you're looking for skin results, I'd be happy to recommend the best facial for your goals.`;
  }

  if (hasAny(text, [/(book|booking|availability|available|appointment|appt|today|tomorrow|this week)/])) {
    if (location) {
      return pickVariant(text, [
        `The quickest way is to check live availability here: ${BOOKING_URL}.${getLocationLine(location)} If you want help choosing the right facial, I can help with that too.`,
        `You can book instantly here: ${BOOKING_URL}.${getLocationLine(location)} If you want, I can recommend the best facial before you book.`,
      ]);
    }
    return pickVariant(text, [
      `The quickest way is to check live availability and book here: ${BOOKING_URL}. If you want, tell me your location and skin goals and I'll help narrow it down.`,
      `You can see real-time openings and book here: ${BOOKING_URL}. Share your location + skin goals and I can point you to the best option.`,
    ]);
  }

  if (hasAny(text, [/(price|pricing|cost|how much)/])) {
    return pickVariant(text, [
      `30-minute facials start at $119, and 50-minute facials start at $169. Members receive lower pricing too. Full menu: ${SERVICES_URL}`,
      `Pricing starts at $119 for 30 minutes and $169 for 50 minutes. Members receive lower rates. Full menu: ${SERVICES_URL}`,
    ]);
  }

  if (hasAny(text, [/(membership|member|cancel|pause|billing|credit|freeze)/])) {
    return pickVariant(text, [
      `For membership help, email ${CONTACTS.memberships.email} or call ${CONTACTS.memberships.phone}. You can also use the FAQ here: ${CONTACTS.memberships.faqUrl}`,
      `For membership questions (cancel, pause, billing, credits), email ${CONTACTS.memberships.email} or call ${CONTACTS.memberships.phone}. FAQ: ${CONTACTS.memberships.faqUrl}`,
    ]);
  }

  if (hasAny(text, [/(gift ?card)/])) {
    return `You can purchase gift cards here: ${GIFT_CARD_URL}. If a gift card isn't working, email ${CONTACTS.giftCards.email} with the card details and the team will help.`;
  }

  if (hasAny(text, [/(product|skincare|return|refund|order number|shop)/])) {
    return `For product questions, email ${CONTACTS.products.email}. For online shop items, you can also browse here: ${SHOP_URL}. If you need return help, send ${CONTACTS.products.email} your order number and details.`;
  }

  if (hasAny(text, [/(career|job|hiring|position|work there)/])) {
    return `We're always looking for great people. You can see open roles here: ${CAREERS_URL}`;
  }

  if (hasAny(text, [/(collab|collaboration|partnership|influencer|creator|ugc)/])) {
    return `For collaboration and partnership inquiries, please email ${CONTACTS.collaborations.email} with your handle, audience size, and what you have in mind.`;
  }

  if (hasAny(text, [/(event|bachelorette|birthday|corporate|bridal|group booking)/])) {
    return `We host group events. Email ${CONTACTS.events.email} with your group size, preferred location, and date, and the team will take it from there.`;
  }

  if (hasAny(text, [/(pregnan|postpartum|breastfeeding|nursing)/])) {
    return 'Yes. Our pregnancy-safe options are the Sensitive Skin Facial (50 min), Signature Facial (30 min), and Lymphatic Facial (30 min). Just let your esthetician know at check-in.';
  }

  if (hasAny(text, [/(running late|late|delay|traffic|reschedule)/])) {
    if (location) {
      return `Please call ${location.name} directly at ${location.phone} so they can adjust your schedule. If you're more than 10 minutes late, the appointment may be marked as a no-show with a 50% fee.`;
    }
    return `Please call your location directly so they can adjust your schedule. If you want, send me the location and I'll give you the right phone number.`;
  }

  if (hasAny(text, [/(hours|open|close|closing time)/])) {
    if (location) {
      return `${location.name} is typically open Monday-Friday 8am-9pm and Saturday-Sunday 9am-7pm, though hours can vary a bit.${getLocationLine(location)}`;
    }
    return 'Most locations are open Monday-Friday 8am-9pm and Saturday-Sunday 9am-7pm, though hours can vary a bit by location. If you send me the location, I can give you the direct number too.';
  }

  if (location && hasAny(text, [/(phone|number|call|contact)/])) {
    return `${location.name} can be reached directly at ${location.phone}. Calling the location is usually the fastest way to get immediate help.`;
  }

  if (skinConcernReply) {
    return skinConcernReply;
  }

  if (hasAny(text, [/(bad experience|upset|disappointed|terrible|awful|rude|burned|reaction|complaint|not happy)/])) {
    if (location) {
      return `I'm so sorry to hear that. Please call ${location.name} directly at ${location.phone} so they can make it right. You can also email ${CONTACTS.general.email} or call ${GENERAL_PHONE}.`;
    }
    return `I'm so sorry to hear that. That's not the experience we want anyone to have. If you send me the location, I'll share the direct number. You can also email ${CONTACTS.general.email} or call ${GENERAL_PHONE}.`;
  }

  if (location && hasAny(text, [/(where|which location|location|near me)/])) {
    return `${location.name} is one of our locations, and the direct line is ${location.phone}. If you want to book there, here's the fastest link: ${BOOKING_URL}`;
  }

  return null;
}
