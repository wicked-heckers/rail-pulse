// ─── Rail-Pulse Landing Page Translations ────────────────────────────────────
// Three supported locales: English, Hindi, Odia

export type Lang = 'EN' | 'HI' | 'OR';

export interface T {
  nav: {
    brand: string;
    myJourney: string;
    allTrains: string;
  };
  hero: {
    headline: string;
    subtitle: string;
  };
  search: {
    tabTrack: string;
    tabFind: string;
    fromPlaceholder: string;
    toPlaceholder: string;
    btnSearch: string;
    trackPlaceholder: string;
    btnTrack: string;
    recentTitle: string;
    recentClear: string;
  };
  comparison: {
    otherLabel: string;
    otherQuote: string;
    otherSub: string;
    rpLabel: string;
    rpQuote: string;
    rpQuoteP1: string;
    rpQuoteP2: string;
    rpSub: string;
  };
  steps: {
    s1Title: string;
    s1Body: string;
    s2Title: string;
    s2Body: string;
    s3Title: string;
    s3Body: string;
  };
  footer: string;
}

export const TRANSLATIONS: Record<Lang, T> = {
  EN: {
    nav: {
      brand: 'RAIL-PULSE',
      myJourney: 'My journey',
      allTrains: 'All trains',
    },
    hero: {
      headline: 'Will your train really reach on time?',
      subtitle:
        "Rail-Pulse watches every train around yours, not just yours. You get a realistic arrival window, and a backup plan if you\u2019re running late.",
    },
    search: {
      tabTrack: 'Track Train',
      tabFind: 'Find Trains',
      fromPlaceholder: 'Select departure station...',
      toPlaceholder: 'Select destination station...',
      btnSearch: 'Search',
      trackPlaceholder: 'Enter train number or name, e.g., 12821 Dhauli Express',
      btnTrack: 'Track',
      recentTitle: 'Recent searches',
      recentClear: 'Clear',
    },
    comparison: {
      otherLabel: 'OTHER APPS SAY',
      otherQuote: '"Arrives before noon."',
      otherSub: 'One time, which assumes the track ahead is empty.',
      rpLabel: 'RAIL-PULSE SAYS',
      rpQuote: '"Most likely ',
      rpQuoteP1: '12:09',
      rpQuoteP2: '12:24',
      rpSub: 'A range that counts overtakes and goods trains.',
    },
    steps: {
      s1Title: '1. Tell us your train',
      s1Body: 'Enter a train number, or find it by stations.',
      s2Title: '2. We watch the whole track',
      s2Body: 'Trains ahead and behind, overtakes and goods trains.',
      s3Title: '3. Get a range and a backup plan',
      s3Body: "If you\u2019re at risk, we suggest a cab or bus option.",
    },
    footer:
      'Predictions can change. Rail-Pulse is not an official Indian Railways service.',
  },

  HI: {
    nav: {
      brand: 'RAIL-PULSE',
      myJourney: 'मेरी यात्रा',
      allTrains: 'सभी ट्रेनें',
    },
    hero: {
      headline: 'क्या आपकी ट्रेन सच में समय पर पहुंचेगी?',
      subtitle:
        'Rail-Pulse सिर्फ आपकी ट्रेन नहीं, बल्कि आसपास की हर ट्रेन पर नज़र रखता है। आपको वास्तविक आगमन सीमा और देरी होने पर बैकअप योजना मिलती है।',
    },
    search: {
      tabTrack: 'ट्रेन ट्रैक करें',
      tabFind: 'ट्रेन खोजें',
      fromPlaceholder: 'प्रस्थान स्टेशन चुनें...',
      toPlaceholder: 'गंतव्य स्टेशन चुनें...',
      btnSearch: 'खोजें',
      trackPlaceholder: 'ट्रेन नंबर या नाम डालें, जैसे 12821 Dhauli Express',
      btnTrack: 'ट्रैक करें',
      recentTitle: 'हाल की खोजें',
      recentClear: 'हटाएं',
    },
    comparison: {
      otherLabel: 'अन्य ऐप कहते हैं',
      otherQuote: '"दोपहर से पहले पहुंचेगी।"',
      otherSub: 'एक समय, जो मानता है कि आगे का ट्रैक खाली है।',
      rpLabel: 'RAIL-PULSE कहता है',
      rpQuote: '"अधिकतम संभावना ',
      rpQuoteP1: '12:09',
      rpQuoteP2: '12:24',
      rpSub: 'एक सीमा जो ओवरटेक और मालगाड़ियों को ध्यान में रखती है।',
    },
    steps: {
      s1Title: '1. अपनी ट्रेन बताएं',
      s1Body: 'ट्रेन नंबर डालें, या स्टेशन से खोजें।',
      s2Title: '2. हम पूरे ट्रैक पर नज़र रखते हैं',
      s2Body: 'आगे-पीछे की ट्रेनें, ओवरटेक और मालगाड़ियां।',
      s3Title: '3. सीमा और बैकअप प्लान पाएं',
      s3Body: 'जोखिम होने पर हम कैब या बस विकल्प सुझाते हैं।',
    },
    footer:
      'अनुमान बदल सकते हैं। Rail-Pulse भारतीय रेलवे की आधिकारिक सेवा नहीं है।',
  },

  OR: {
    nav: {
      brand: 'RAIL-PULSE',
      myJourney: 'ମୋ ଯାତ୍ରା',
      allTrains: 'ସମସ୍ତ ଟ୍ରେନ୍',
    },
    hero: {
      headline: 'ଆପଣଙ୍କ ଟ୍ରେନ୍ ଆଦୌ ସମୟରେ ପହଞ୍ଚିବ କି?',
      subtitle:
        'Rail-Pulse କେବଳ ଆପଣଙ୍କ ଟ୍ରେନ୍ ନୁହେଁ, ଆଖପାଖ ସମସ୍ତ ଟ୍ରେନ୍ ଉପରେ ନଜର ରଖେ। ଆପଣ ବାସ୍ତବ ଆଗମନ ସମୟ ଓ ବ୍ୟାକଅପ୍ ଯୋଜନା ପାଇବେ।',
    },
    search: {
      tabTrack: 'ଟ୍ରେନ୍ ଟ୍ରାକ୍ କରନ୍ତୁ',
      tabFind: 'ଟ୍ରେନ୍ ଖୋଜନ୍ତୁ',
      fromPlaceholder: 'ଯାତ୍ରା ଆରମ୍ଭ ଷ୍ଟେସନ୍ ବାଛନ୍ତୁ...',
      toPlaceholder: 'ଗନ୍ତବ୍ୟ ଷ୍ଟେସନ୍ ବାଛନ୍ତୁ...',
      btnSearch: 'ଖୋଜନ୍ତୁ',
      trackPlaceholder: 'ଟ୍ରେନ୍ ନମ୍ବର ବା ନାମ ଦିଅନ୍ତୁ, ଯଥା 12821 Dhauli Express',
      btnTrack: 'ଟ୍ରାକ୍',
      recentTitle: 'ନିକଟ ଅନୁସନ୍ଧାନ',
      recentClear: 'ସଫା',
    },
    comparison: {
      otherLabel: 'ଅନ୍ୟ ଆପ୍ କହୁଛି',
      otherQuote: '"ଦ୍ୱିପ୍ରହରରୁ ଆଗ ପହଞ୍ଚିବ।"',
      otherSub: 'ଏକ ସମୟ, ଯାହା ଧରିନିଏ ଆଗ ଟ୍ରାକ ଖାଲି ଅଛି।',
      rpLabel: 'RAIL-PULSE କହୁଛି',
      rpQuote: '"ସବୁଠୁ ସଂଭବ ',
      rpQuoteP1: '12:09',
      rpQuoteP2: '12:24',
      rpSub: 'ଏକ ସୀମା ଯାହା ଓଭର୍‌ଟେକ୍ ଓ ମାଲ ଗାଡ଼ି ଗଣ ଥାଏ।',
    },
    steps: {
      s1Title: '୧. ଆପଣଙ୍କ ଟ୍ରେନ୍ ଜଣାନ୍ତୁ',
      s1Body: 'ଟ୍ରେନ୍ ନମ୍ବର ଦିଅନ୍ତୁ, ବା ଷ୍ଟେସନ ଦ୍ୱାରା ଖୋଜନ୍ତୁ।',
      s2Title: '୨. ଆମ ସମ୍ପୂର୍ଣ ଟ୍ରାକ ଦେଖୁ',
      s2Body: 'ଆଗ-ପଛ ଟ୍ରେନ, ଓଭର୍‌ଟେକ ଓ ମାଲ ଗାଡ଼ି।',
      s3Title: '୩. ସୀମା ଓ ବ୍ୟାକଅପ୍ ଯୋଜନା ପାଆନ୍ତୁ',
      s3Body: 'ଝୁଁକିରେ ଥଲେ, ଆମ କ୍ୟାବ ବା ବସ ସୁଝାଉ।',
    },
    footer:
      'ଅନୁମାନ ବଦଳି ପାରେ। Rail-Pulse ଭାରତୀୟ ରେଳ ର ଅଧିକୃତ ସେବା ନୁହଁ।',
  },
};
