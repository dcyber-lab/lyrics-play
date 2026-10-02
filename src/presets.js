// Built-in playlists. Only track metadata lives here; lyrics are fetched
// from LRCLIB on the device when the user imports a preset.
// duration (seconds) picks the right version among LRCLIB matches.

const t = (title, artist, mmss) => {
  const [m, s] = mmss.split(':').map(Number);
  return { title, artist, duration: m * 60 + s };
};

export const presets = [
  {
    id: 'the-weeknd',
    name: 'The Weeknd',
    artist: 'The Weeknd', // for the card's photo
    tracks: [
      t('The Abyss (feat. Lana Del Rey)', 'The Weeknd', '4:42'),
      t('Wake Me Up (feat. Justice)', 'The Weeknd', '5:08'),
      t('Starboy', 'The Weeknd', '3:50'),
      t('After Hours', 'The Weeknd', '6:01'),
      t('Heartless', 'The Weeknd', '3:18'),
      t('Faith', 'The Weeknd', '4:43'),
      t('Take My Breath', 'The Weeknd', '5:39'),
      t('Sacrifice', 'The Weeknd', '3:08'),
      t('How Do I Make You Love Me?', 'The Weeknd', '3:34'),
      t("Can't Feel My Face", 'The Weeknd', '3:33'),
      t('Lost in the Fire (feat. The Weeknd)', 'Gesaffelstein', '3:22'),
      t('Kiss Land', 'The Weeknd', '7:35'),
      t('Often', 'The Weeknd', '4:09'),
      t('Given Up On Me', 'The Weeknd', '5:54'),
      t('I Was Never There', 'The Weeknd', '4:01'),
      t('The Hills', 'The Weeknd', '4:02'),
      t('Baptized In Fear', 'The Weeknd', '3:52'),
      t('Open Hearts', 'The Weeknd', '3:54'),
      t('Cry For Me', 'The Weeknd', '3:44'),
      t('São Paulo (feat. Anitta)', 'The Weeknd', '5:01'),
      t('Timeless (feat Playboi Carti)', 'The Weeknd', '4:16'),
      t('RATHER LIE (with The Weeknd)', 'Playboi Carti', '3:29'),
      t("Creepin' (with The Weeknd & 21 Savage)", 'Metro Boomin', '3:41'),
      t('One Of The Girls (with JENNIE, Lily Rose Depp)', 'The Weeknd', '4:04'),
      t('Stargirl Interlude', 'The Weeknd', '1:51'),
      t('Out of Time', 'The Weeknd', '3:34'),
      t('I Feel It Coming', 'The Weeknd', '4:29'),
      t('Die For You', 'The Weeknd', '4:20'),
      t('Is There Someone Else?', 'The Weeknd', '3:19'),
      t('Wicked Games', 'The Weeknd', '5:23'),
      t('Call Out My Name', 'The Weeknd', '3:48'),
      t('The Morning', 'The Weeknd', '5:14'),
      t('Save Your Tears', 'The Weeknd', '3:35'),
      t('Less Than Zero', 'The Weeknd', '3:31'),
      t('Blinding Lights', 'The Weeknd', '3:20'),
      t('Without a Warning', 'The Weeknd', '4:57'),
      t('Reflections Laughing (feat. Travis Scott, Florence + The Machine)', 'The Weeknd', '4:51'),
      t('High For This', 'The Weeknd', '4:09'),
      t('House Of Balloons / Glass Table Girls', 'The Weeknd', '6:47'),
      t('Moth To A Flame (with The Weeknd)', 'Swedish House Mafia', '3:54'),
    ],
  },
];
