// ─── Rail-Pulse Landing Page Translations ────────────────────────────────────
// Three supported locales: English, Hindi, Odia

export type Lang = 'EN' | 'HI' | 'OR';

interface T {
  nav: {
    brand: string;
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
    btnTrack: string;
  };
  comparison: {
    standardLabel: string;
    standardTitle: string;
    standardDesc: string;
    rpLabel: string;
    rpTitle: string;
    rpDesc: string;
  };
  steps: {
    s1Badge: string;
    s1Title: string;
    s1Desc: string;
    s2Badge: string;
    s2Title: string;
    s2Desc: string;
    s3Badge: string;
    s3Title: string;
    s3Desc: string;
  };
}

export const TRANSLATIONS: Record<Lang, T> = {
  EN: {
    nav: {
      brand: 'RAIL-PULSE',
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
      btnTrack: 'Track',
    },
    comparison: {
      standardLabel: 'STANDARD TRACKERS',
      standardTitle: 'One fixed arrival guess',
      standardDesc:
        'Assumes the track ahead is empty, so sudden delays catch you off guard.',
      rpLabel: 'RAIL-PULSE',
      rpTitle: 'Realistic arrival window',
      rpDesc:
        'Watches goods trains and overtakes ahead—warning you early if a connection is tight.',
    },
    steps: {
      s1Badge: 'STEP 1',
      s1Title: 'Pick your train',
      s1Desc: 'Enter a train number or pick your stations in seconds.',
      s2Badge: 'STEP 2',
      s2Title: 'See track traffic',
      s2Desc: 'Spot slow goods trains and overtakes ahead in real time.',
      s3Badge: 'STEP 3',
      s3Title: 'Protect connections',
      s3Desc: 'Get an early alert and a faster cab route if time gets tight.',
    },
  },

  HI: {
    nav: {
      brand: 'RAIL-PULSE',
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
      btnTrack: 'ट्रैक करें',
    },
    comparison: {
      standardLabel: 'साधारण ट्रैकर',
      standardTitle: 'एक निश्चित आगमन का अनुमान',
      standardDesc:
        'मान लेते हैं कि आगे का ट्रैक खाली है, जिससे अचानक होने वाली देरी हैरान कर देती है।',
      rpLabel: 'RAIL-PULSE',
      rpTitle: 'वास्तविक आगमन समय सीमा',
      rpDesc:
        'आगे चल रही मालगाड़ियों और ओवरटेक पर नज़र रखता है—समय कम होने पर पहले ही चेतावनी देता है।',
    },
    steps: {
      s1Badge: 'चरण 1',
      s1Title: 'अपनी ट्रेन चुनें',
      s1Desc: 'ट्रेन नंबर डालें या स्टेशनों को चंद सेकंड में चुनें।',
      s2Badge: 'चरण 2',
      s2Title: 'ट्रैक ट्रैफ़िक देखें',
      s2Desc: 'धीमी मालगाड़ियों और ओवरटेक को रीयल-टाइम में पहचानें।',
      s3Badge: 'चरण 3',
      s3Title: 'कनेक्शन सुरक्षित करें',
      s3Desc: 'समय कम होने पर त्वरित अलर्ट और तेज़ कैब विकल्प पाएं।',
    },
  },

  OR: {
    nav: {
      brand: 'RAIL-PULSE',
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
      btnTrack: 'ଟ୍ରାକ୍',
    },
    comparison: {
      standardLabel: 'ସାଧାରଣ ଟ୍ରାକର୍',
      standardTitle: 'ଏକ ନିର୍ଦ୍ଦିଷ୍ଟ ପହଞ୍ଚିବା ଅନୁମାନ',
      standardDesc:
        'ଧରିନିଏ ଯେ ଆଗ ଟ୍ରାକ ଖାଲି ଅଛି, ଯାହାଦ୍ୱାରା ହଠାତ ବିଳମ୍ବ ଅସୁବିଧାରେ ପକାଏ।',
      rpLabel: 'RAIL-PULSE',
      rpTitle: 'ବାସ୍ତବ ଆଗମନ ସମୟ ସୀମା',
      rpDesc:
        'ଆଗରେ ଥିବା ମାଲଗାଡ଼ି ଓ ଓଭରଟେକ ଉପରେ ନଜର ରଖେ—କନେକ୍ସନ ଟାଇଟ୍ ହେଲେ ଆଗୁଆ ସତର୍କ କରେ।',
    },
    steps: {
      s1Badge: 'ପଦକ୍ଷେପ ୧',
      s1Title: 'ଆପଣଙ୍କ ଟ୍ରେନ୍ ବାଛନ୍ତୁ',
      s1Desc: 'ଟ୍ରେନ୍ ନମ୍ବର ଦିଅନ୍ତୁ ବା ସେକେଣ୍ଡରେ ଷ୍ଟେସନ ବାଛନ୍ତୁ।',
      s2Badge: 'ପଦକ୍ଷେପ ୨',
      s2Title: 'ଟ୍ରାକ ଟ୍ରାଫିକ ଦେଖନ୍ତୁ',
      s2Desc: 'ଧୀମା ମାଲଗାଡ଼ି ଓ ଓଭରଟେକ ରିଅଲ-ଟାଇମରେ ଜାଣନ୍ତୁ।',
      s3Badge: 'ପଦକ୍ଷେପ ୩',
      s3Title: 'କନେକ୍ସନ ସୁରକ୍ଷିତ ରଖନ୍ତୁ',
      s3Desc: 'ସମୟ କମ ଥିଲେ ଆଗୁଆ ସତର୍କତା ଓ ଦ୍ରୁତ କ୍ୟାବ ବିକଳ୍ପ ପାଆନ୍ତୁ।',
    },
  },
};
