// The patient's vocabulary. Darija is the spoken output; French and English are
// shown to staff. To use a real voice instead of the synthetic one, record a
// clip per phrase and save it as web/public/audio/<id>.mp3.
//
// urgency: routine | attention | urgent. "attention" phrases become urgent when
// the vital signs show the body is under stress (see fusion.js).

export const CATEGORIES = [
  { id: 'body', icon: 'activity', ar: 'بدني', latin: 'Badni', fr: 'Corps', en: 'Body' },
  { id: 'needs', icon: 'cup-soda', ar: 'نحتاج', latin: 'Nest7a9', fr: 'Besoins', en: 'Needs' },
  { id: 'people', icon: 'users', ar: 'الناس', latin: 'Ennes', fr: 'Personnes', en: 'People' },
  { id: 'feelings', icon: 'heart', ar: 'إحساسي', latin: 'E7sesi', fr: 'Ressenti', en: 'Feelings' },
  { id: 'controls', icon: 'sliders-horizontal', ar: 'إعدادات', latin: 'I3dadet', fr: 'Réglages', en: 'Settings' },
];

export const PHRASES = [
  // Body
  { id: 'pain', category: 'body', urgency: 'attention', icon: 'zap', ar: 'يوجعني', latin: 'Youja3ni', fr: "J'ai mal", en: 'I am in pain' },
  { id: 'breath', category: 'body', urgency: 'urgent', icon: 'wind', ar: 'ما نجمش نتنفس', latin: 'Ma najjamch netnaffes', fr: 'Je ne peux pas respirer', en: 'I cannot breathe' },
  { id: 'cold', category: 'body', urgency: 'routine', icon: 'snowflake', ar: 'عندي البرد', latin: '3andi el bard', fr: "J'ai froid", en: 'I am cold' },
  { id: 'hot', category: 'body', urgency: 'routine', icon: 'sun', ar: 'سخنت', latin: 'S5ont', fr: "J'ai chaud", en: 'I am hot' },
  { id: 'position', category: 'body', urgency: 'routine', icon: 'bed', ar: 'بدلولي القعدة', latin: 'Baddlouli el 9a3da', fr: 'Changez ma position', en: 'Change my position' },

  // Needs
  { id: 'water', category: 'needs', urgency: 'routine', icon: 'glass-water', ar: 'نحب نشرب', latin: 'N7eb nochrob', fr: 'Je veux boire', en: 'I want to drink' },
  { id: 'food', category: 'needs', urgency: 'routine', icon: 'utensils', ar: 'جعت', latin: 'Jo3t', fr: "J'ai faim", en: 'I am hungry' },
  { id: 'toilet', category: 'needs', urgency: 'attention', icon: 'bath', ar: 'نحب نمشي للتواليت', latin: 'N7eb nemchi lel toilette', fr: 'Je dois aller aux toilettes', en: 'I need the toilet' },
  { id: 'sleep', category: 'needs', urgency: 'routine', icon: 'moon', ar: 'نحب نرقد', latin: 'N7eb nor9od', fr: 'Je veux dormir', en: 'I want to sleep' },
  { id: 'light', category: 'needs', urgency: 'routine', icon: 'lamp', ar: 'طفيولي الضو', latin: 'Taffiwli edhaw', fr: 'Éteignez la lumière', en: 'Turn off the light' },

  // People
  { id: 'nurse', category: 'people', urgency: 'attention', icon: 'bell-ring', ar: 'عيطولي للفرملي', latin: '3aytouli lel fermli', fr: "Appelez l'infirmier", en: 'Call the nurse' },
  { id: 'doctor', category: 'people', urgency: 'attention', icon: 'stethoscope', ar: 'عيطولي للطبيب', latin: '3aytouli lel tbib', fr: 'Appelez le médecin', en: 'Call the doctor' },
  { id: 'daughter', category: 'people', urgency: 'routine', icon: 'phone', ar: 'عيطولي لبنتي', latin: '3aytouli l benti', fr: 'Appelez ma fille', en: 'Call my daughter' },
  { id: 'son', category: 'people', urgency: 'routine', icon: 'phone', ar: 'عيطولي لولدي', latin: '3aytouli l weldi', fr: 'Appelez mon fils', en: 'Call my son' },
  { id: 'family', category: 'people', urgency: 'routine', icon: 'house', ar: 'نحب نشوف عايلتي', latin: 'N7eb nchouf 3ayelti', fr: 'Je veux voir ma famille', en: 'I want to see my family' },

  // Feelings
  { id: 'scared', category: 'feelings', urgency: 'attention', icon: 'cloud-lightning', ar: 'خايف', latin: '5ayef', fr: "J'ai peur", en: 'I am scared' },
  { id: 'tired', category: 'feelings', urgency: 'routine', icon: 'battery-low', ar: 'تعبت', latin: 'Ta3bet', fr: 'Je suis fatigué', en: 'I am tired' },
  { id: 'bored', category: 'feelings', urgency: 'routine', icon: 'hourglass', ar: 'قلقت', latin: '9la9t', fr: "Je m'ennuie", en: 'I am bored' },
  { id: 'thanks', category: 'feelings', urgency: 'routine', icon: 'hand-heart', ar: 'يعيشك', latin: 'Y3aychek', fr: 'Merci', en: 'Thank you' },
  { id: 'love', category: 'feelings', urgency: 'routine', icon: 'heart', ar: 'نحبكم', latin: 'N7ebkom', fr: 'Je vous aime', en: 'I love you' },

  // Quick answers (on the home screen and the question screen)
  { id: 'yes', category: 'answers', urgency: 'routine', icon: 'check', ar: 'إيه', latin: 'Ih', fr: 'Oui', en: 'Yes' },
  { id: 'no', category: 'answers', urgency: 'routine', icon: 'x', ar: 'لا', latin: 'Le', fr: 'Non', en: 'No' },
  { id: 'unsure', category: 'answers', urgency: 'routine', icon: 'circle-question-mark', ar: 'ما نعرفش', latin: 'Ma na3rafch', fr: 'Je ne sais pas', en: 'I do not know' },
];

export const PHRASES_BY_ID = new Map(PHRASES.map((p) => [p.id, p]));

/** Phrases the suggestion model may rank (answers are always on screen already). */
export const SUGGESTIBLE_IDS = PHRASES.filter((p) => p.category !== 'answers').map((p) => p.id);

/** Phrases that matter most when the body shows signs of distress. */
export const DISTRESS_IDS = new Set(['pain', 'breath', 'nurse', 'scared', 'position']);
