// Curated song packs. Run `node scripts/build-packs.mjs` after editing:
// it checks every song has synced lyrics + an official track and writes packs.json.

export const PACKS = [
  {
    id: 'naija', name: 'Naija Anthems', emoji: '🇳🇬', blurb: 'The ones everybody knows word for word',
    songs: [
      ['Last Last', 'Burna Boy'], ['Calm Down', 'Rema'], ['Essence', 'Wizkid'], ['Fall', 'Davido'],
      ['Love Nwantiti (Ah Ah Ah)', 'CKay'], ['Ye', 'Burna Boy'], ['Ojuelegba', 'Wizkid'], ['Unavailable', 'Davido'],
      ['Joha', 'Asake'], ['Rush', 'Ayra Starr'], ['Peru', 'Fireboy DML'], ['Soweto', 'Victony'],
      ['Sungba', 'Asake'], ['Bandana', 'Fireboy DML'], ['Ku Lo Sa', 'Oxlade'], ['Commas', 'Ayra Starr'],
      ['Charm', 'Rema'], ['Buga', 'Kizz Daniel'], ['Terminator', 'King Promise'], ['Kilometre', 'Burna Boy'],
    ],
  },
  {
    id: 'throwback', name: 'Naija Throwbacks', emoji: '⏪', blurb: '2000s–2010s classics',
    songs: [
      ['African Queen', '2Baba'], ['No One Like You', 'P-Square'], ['Do Me', 'P-Square'], ['Personally', 'P-Square'],
      ['Chop My Money', 'P-Square'], ['Oliver Twist', "D'banj"], ['Pakurumo', 'Wande Coal'], ['Ada Ada', 'Flavour'],
      ['Ashawo', 'Flavour'], ['Holla at Your Boy', 'Wizkid'], ['Dami Duro', 'Davido'], ['Skelewu', 'Davido'],
      ['Aye', 'Davido'], ['Kukere', 'Iyanya'], ['Shoki', 'Lil Kesh'], ['Johnny', 'Yemi Alade'],
      ['Dorobucci', "Mavin Records"], ['Eminado', 'Tiwa Savage'], ['Ife', 'Simi'], ['Yori Yori', 'Bracket'],
    ],
  },
  {
    id: 'amapiano', name: 'Amapiano & Street', emoji: '🎹', blurb: 'Log drums and street pop',
    songs: [
      ['Water', 'Tyla'], ['Mnike', 'Tyler ICU'], ['Ke Star', 'Focalistic'], ['Jerusalema', 'Master KG'],
      ['Tshwala Bam', 'TitoM'], ['Lonely At The Top', 'Asake'], ['Terminator', 'Asake'], ['Organise', 'Asake'],
      ['Sability', 'Ayra Starr'], ['Ozeba', 'Rema'], ['Gwo Gwo Gwo Ngwo', 'Olamide'], ['Wonderful', 'Burna Boy'],
      ['Feel', 'Davido'], ['Kpeke', 'Timaya'], ['Cough (Odo)', 'Kizz Daniel'], ['Monalisa', 'Lojay'],
    ],
  },
  {
    id: 'gospel', name: 'Gospel & Worship', emoji: '⛪', blurb: 'Praise, worship and Sunday favourites',
    songs: [
      ['Way Maker', 'Sinach'], ['Excess Love', 'Mercy Chinwo'], ['Imela', 'Nathaniel Bassey'], ['Too Faithful', 'Moses Bliss'],
      ['Ekwueme', 'Prospa Ochimana'], ['Oceans (Where Feet May Fail)', 'Hillsong UNITED'], ['Break Every Chain', 'Tasha Cobbs Leonard'],
      ['I Smile', 'Kirk Franklin'], ['God Will Make a Way', 'Don Moen'], ['Goodness of God', 'CeCe Winans'],
      ['Graves Into Gardens', 'Elevation Worship'], ['10,000 Reasons (Bless the Lord)', 'Matt Redman'],
      ['What a Beautiful Name', 'Hillsong Worship'], ['Jireh', 'Elevation Worship'], ['Total Praise', 'Richard Smallwood'],
      ['Overcomer', 'Mandisa'], ['Amazing Grace (My Chains Are Gone)', 'Chris Tomlin'], ['Way Maker', 'Leeland'],
      ['Yahweh', 'Mercy Chinwo'], ['Bless God', 'Brandon Lake'],
    ],
  },
  {
    id: 'pop', name: 'Pop Hits', emoji: '🎤', blurb: 'Global sing-along pop',
    songs: [
      ['Shape of You', 'Ed Sheeran'], ['Blinding Lights', 'The Weeknd'], ['Someone Like You', 'Adele'], ['Rolling in the Deep', 'Adele'],
      ['Uptown Funk', 'Mark Ronson'], ['Flowers', 'Miley Cyrus'], ['Perfect', 'Ed Sheeran'], ['Love Story', 'Taylor Swift'],
      ['Shake It Off', 'Taylor Swift'], ['Levitating', 'Dua Lipa'], ['As It Was', 'Harry Styles'], ['Stay', 'The Kid LAROI'],
      ['Baby', 'Justin Bieber'], ['Umbrella', 'Rihanna'], ['Diamonds', 'Rihanna'], ['Firework', 'Katy Perry'],
      ['Happy', 'Pharrell Williams'], ['Espresso', 'Sabrina Carpenter'], ['Anti-Hero', 'Taylor Swift'], ['Counting Stars', 'OneRepublic'],
    ],
  },
  {
    id: 'rnb', name: 'R&B & Love Songs', emoji: '💔', blurb: 'Slow jams and big ballads',
    songs: [
      ['All of Me', 'John Legend'], ['No One', 'Alicia Keys'], ['Irreplaceable', 'Beyoncé'], ['Halo', 'Beyoncé'],
      ['Let Me Love You', 'Mario'], ['Thinking Out Loud', 'Ed Sheeran'], ["Say You Won't Let Go", 'James Arthur'], ['Adorn', 'Miguel'],
      ['We Belong Together', 'Mariah Carey'], ['I Will Always Love You', 'Whitney Houston'], ['End of the Road', 'Boyz II Men'],
      ['Die With A Smile', 'Lady Gaga'], ['Just the Way You Are', 'Bruno Mars'], ['Talking to the Moon', 'Bruno Mars'],
      ['Love On Top', 'Beyoncé'], ['So Sick', 'Ne-Yo'], ['Leave The Door Open', 'Bruno Mars'], ['Kiss Me More', 'Doja Cat'],
    ],
  },
  {
    id: 'hiphop', name: 'Hip-Hop & Rap', emoji: '🎧', blurb: 'Bars only. Keep up.',
    songs: [
      ['Lose Yourself', 'Eminem'], ['Without Me', 'Eminem'], ["God's Plan", 'Drake'], ['One Dance', 'Drake'],
      ['HUMBLE.', 'Kendrick Lamar'], ['Not Like Us', 'Kendrick Lamar'], ['In Da Club', '50 Cent'], ['SICKO MODE', 'Travis Scott'],
      ['Gold Digger', 'Kanye West'], ['Stronger', 'Kanye West'], ['Empire State of Mind', 'JAY-Z'], ['Old Town Road', 'Lil Nas X'],
      ['rockstar', 'Post Malone'], ['Sunflower', 'Post Malone'], ['Hotline Bling', 'Drake'], ['Love the Way You Lie', 'Eminem'],
      ['Mockingbird', 'Eminem'], ['See You Again', 'Wiz Khalifa'],
    ],
  },
  {
    id: 'classics', name: 'Rock & Classics', emoji: '🎸', blurb: 'Legends only',
    songs: [
      ['Bohemian Rhapsody', 'Queen'], ["Don't Stop Me Now", 'Queen'], ['Hotel California', 'Eagles'], ["Sweet Child O' Mine", "Guns N' Roses"],
      ['Mr. Brightside', 'The Killers'], ["Livin' on a Prayer", 'Bon Jovi'], ['Billie Jean', 'Michael Jackson'], ['Beat It', 'Michael Jackson'],
      ['Africa', 'TOTO'], ['Wonderwall', 'Oasis'], ["Don't Stop Believin'", 'Journey'], ['Yellow', 'Coldplay'],
      ['Viva La Vida', 'Coldplay'], ['Numb', 'Linkin Park'], ['In the End', 'Linkin Park'], ['Smells Like Teen Spirit', 'Nirvana'],
      ['Thriller', 'Michael Jackson'], ['Dancing Queen', 'ABBA'],
    ],
  },
  {
    id: 'party', name: '2000s Party', emoji: '🕺', blurb: 'Throwback club bangers',
    songs: [
      ['Yeah!', 'Usher'], ['Crazy In Love', 'Beyoncé'], ["Hips Don't Lie", 'Shakira'], ['Waka Waka (This Time for Africa)', 'Shakira'],
      ['Hey Ya!', 'Outkast'], ['I Gotta Feeling', 'Black Eyed Peas'], ['Party Rock Anthem', 'LMFAO'], ['Low', 'Flo Rida'],
      ['Toxic', 'Britney Spears'], ['Since U Been Gone', 'Kelly Clarkson'], ['Bleeding Love', 'Leona Lewis'], ['Beautiful Girls', 'Sean Kingston'],
      ['Temperature', 'Sean Paul'], ['Dynamite', 'Taio Cruz'], ['OMG', 'Usher'], ['Single Ladies (Put a Ring on It)', 'Beyoncé'],
      ['Umbrella', 'Rihanna'], ['TiK ToK', 'Kesha'],
    ],
  },
  {
    id: 'movies', name: 'Movie & Disney', emoji: '🎬', blurb: 'Soundtracks you secretly know',
    songs: [
      ['Let It Go', 'Idina Menzel'], ["How Far I'll Go", "Auli'i Cravalho"], ['Hakuna Matata', 'Nathan Lane'], ['A Whole New World', 'Lea Salonga'],
      ['Shallow', 'Lady Gaga'], ['This Is Me', 'Keala Settle'], ['My Heart Will Go On', 'Céline Dion'], ["We Don't Talk About Bruno", 'Carolina Gaitán'],
      ['Remember Me', 'Benjamin Bratt'], ['Circle of Life', 'Carmen Twillie'], ['A Million Dreams', 'Ziv Zaifman'], ['Speechless', 'Naomi Scott'],
      ['Let It Go', 'Demi Lovato'], ['City of Stars', 'Ryan Gosling'], ['Skyfall', 'Adele'], ['Gonna Fly Now', 'Bill Conti'],
    ],
  },
];

// live charts, resolved in the browser at play time
export const LIVE = [
  { id: 'trend-ng', name: 'Trending in Nigeria', emoji: '🔥', blurb: 'Live Top 50 chart', country: 'ng' },
  { id: 'trend-us', name: 'Trending Worldwide', emoji: '🌍', blurb: 'Live US Top 50 chart', country: 'us' },
  { id: 'trend-gh', name: 'Trending in Ghana', emoji: '🇬🇭', blurb: 'Live Top 50 chart', country: 'gh' },
];
