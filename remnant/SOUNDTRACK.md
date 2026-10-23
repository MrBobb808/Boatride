# Remnant: the song layer

Generated from `soundtrack/songs.json` by `node scripts/soundtrack-doc.mjs`; edit the JSON, not this file.

## How it works

- Every chapter has a song with lyrics and an instrumental. The song plays once per session when you arrive in its place; after it, the instrumental loops through the chapter.
- Bosses keep the game's own adaptive score, which builds with each phase. Anything without a song file also keeps the score, so the game sounds whole with any number of songs present.
- Settings → Audio → Soundtrack chooses Songs or Score only, and Sung songs turns the lyric versions off.
- Songs are downloaded the first time they play and kept for offline play; game updates do not throw them away.

## Making a song in Suno

1. In Suno, choose Custom. Paste the **Style** below into the style box and the **Lyrics** into the lyrics box (for an instrumental, switch Instrumental on and leave the lyrics empty). Use the **Title** as the song title.
2. Pick the take you like and download it as MP3 (WAV also works).
3. Add it to the game: `node scripts/add-songs.mjs ~/Downloads/<file>` (it matches the file to the song by title, levels the volume and writes `public/music/<id>.mp3`). If the name does not match, add `--as <id>`. Run the script with no files to see which songs are still to make.
4. Listen for the scripture lines: they must be sung word for word as written (King James Version). If Suno changes a word, regenerate or pick another take.

## The songs

| Id | Chapter | Kind | Title | Plays in |
|---|---|---|---|---|
| `title_remnant` | Title | vocal | Remnant | `title` |
| `rest_hearth` | Remnant's Rest | vocal | Remnant's Rest | `rest` |
| `rest_hearth_inst` | Remnant's Rest | instrumental | Remnant's Rest (Hearth) | `rest` |
| `trial_remnant` | Trial | instrumental | The Trial of the Remnant | `trial` |
| `ch1_ashen` | I | vocal | The Ashen Village | `village` |
| `ch1_hearthward` | I | instrumental | Hearthward | `village`, `sanctuary`, `temple`, `crypt` |
| `ch2_shinar` | II | vocal | The Tower of Shinar | `shinar` |
| `ch2_tower` | II | instrumental | Red Brick, Red Sky | `shinar`, `tower` |
| `ch3_bones` | III | vocal | The Valley of Bones | `valley` |
| `ch3_hive` | III | instrumental | The Hive | `valley`, `hive` |
| `ch4_dura` | IV | vocal | The Plain of Dura | `dura` |
| `ch4_furnace` | IV | instrumental | Seven Times Hotter | `dura`, `babylon`, `den`, `furnace` |
| `ch5_wall` | V | vocal | The Writing on the Wall | `riverbed` |
| `ch5_palace` | V | instrumental | The Hanging Gardens | `riverbed`, `gardens`, `palace`, `feast` |
| `ch6_persia` | VI | vocal | The Prince of Persia | `hiddekel` |
| `ch6_shushan` | VI | instrumental | Shushan the Palace | `hiddekel`, `shushan`, `highplaces` |
| `ch7_hunt` | VII | vocal | The Crown of the Hunt | `hunt` |
| `ch7_hunt_inst` | VII | instrumental | The Winter Wood | `hunt` |
| `ch8_plague` | VIII | vocal | The Crown of Pestilence | `plague` |
| `ch8_plague_inst` | VIII | instrumental | The Fen | `plague` |
| `ch9_cinders` | IX | vocal | The Crown of Cinders | `cinders` |
| `ch9_cinders_inst` | IX | instrumental | The Foundry | `cinders` |
| `ch10_grecia` | X | vocal | The Prince of Grecia | `grecia` |
| `ch10_grecia_inst` | X | instrumental | The Storm Coast | `grecia` |

### Remnant (`title_remnant`)

- **Chapter:** Title
- **Kind:** vocal
- **Style:** cinematic dark fantasy hymn, solemn male choir, low strings, taiko, distant female solo vocal, minor key, slow build to an epic chorus, 70 bpm
- **Scripture (KJV, word for word):** Isaiah 10:21

```
[Intro]
(low choir, humming)

[Verse 1]
Ash on the altar, smoke on the hill
A watchman's lantern burning still
No crown was promised, no sword was given
Only a vow and a road toward heaven

[Pre-Chorus]
When the towers rise and the idols stand
Hold the light in a trembling hand

[Chorus]
We are the remnant, few but awake
Bending, not broken, for His name's sake
Through fire and flood to the long night's end
The remnant shall return, return again

[Verse 2]
Kingdoms are built upon borrowed gold
Princes of air and their hearts grown cold
One small flame in the gathering storm
Human and faithful, still holding his ground

[Bridge]
(choir)
The remnant shall return, even the remnant of Jacob, unto the mighty God

[Final Chorus]
We are the remnant, few but awake
Bending, not broken, for His name's sake
Through fire and flood to the long night's end
The remnant shall return, return again

[Outro]
(lone female voice)
Return again
```

### Remnant's Rest (`rest_hearth`)

- **Chapter:** Remnant's Rest
- **Kind:** vocal
- **Style:** warm folk hymn, acoustic guitar, harp, hand drum, soft male and female duet, hopeful campfire song, major key, 76 bpm
- **Scripture (KJV, word for word):** Psalm 46:1

```
[Verse 1]
They came in from the ashes, they came in from the rain
A potter and a shepherd and a boy who lost his name
We set another table, we light another lamp
The road is long behind them, but the fire's warm in camp

[Chorus]
So come in, come in, there's bread enough to share
The walls are thin, but the door is always there
God is our refuge and strength, a very present help in trouble
Come in, come home

[Verse 2]
The forge is ringing early, the garden's coming green
The children chase the swallows where the battle lines had been
And every face he carries home is one more stone we lay
A village built of rescued hearts, a little more each day

[Chorus]
So come in, come in, there's bread enough to share
The walls are thin, but the door is always there
God is our refuge and strength, a very present help in trouble
Come in, come home

[Outro]
(humming, guitar)
Come home
```

### Remnant's Rest (Hearth) (`rest_hearth_inst`)

- **Chapter:** Remnant's Rest
- **Kind:** instrumental
- **Style:** warm acoustic folk instrumental, harp, wooden flute, fingerpicked guitar, soft hand drum, peaceful village, seamless loop, no vocals, 76 bpm

### The Trial of the Remnant (`trial_remnant`)

- **Chapter:** Trial
- **Kind:** instrumental
- **Style:** relentless dark orchestral combat loop, taiko, low brass ostinato, choir stabs, driving strings, arena battle, seamless loop, no vocals, 140 bpm

### The Ashen Village (`ch1_ashen`)

- **Chapter:** I
- **Kind:** vocal
- **Style:** dark folk ballad, lone male vocal, cello, frame drum, village bells, mournful, builds to a choir, D minor, 80 bpm
- **Scripture (KJV, word for word):** Exodus 20:4

```
[Verse 1]
The bell rang once at midnight, then never rang again
The thatch went up like candles in the wind across the glen
I stood the watch at Hearthward, I was no one, I was young
I saw the gold go glowing where the village hymns were sung

[Pre-Chorus]
They raised it in the market square
And called the people down to prayer

[Chorus]
Thou shalt not make unto thee any graven image
I will not bow, I will not kneel
Let the gold burn bright, let the idol stand
I will hold the lamp in my own two hands

[Verse 2]
The ashes in the doorway, the ashes on my sleeve
The ones who stayed behind me and the ones who would not leave
There's a relic in the temple and a covenant below
And a road that leads through fire to a place I do not know

[Chorus]
Thou shalt not make unto thee any graven image
I will not bow, I will not kneel
Let the gold burn bright, let the idol stand
I will hold the lamp in my own two hands

[Outro]
(choir)
I will hold the lamp
```

### Hearthward (`ch1_hearthward`)

- **Chapter:** I
- **Kind:** instrumental
- **Style:** dark medieval ambient, cello drone, harp, distant bells, sparse frame drum, ashes and candlelight, exploration loop, no vocals, 72 bpm

### The Tower of Shinar (`ch2_shinar`)

- **Chapter:** II
- **Kind:** vocal
- **Style:** epic Middle Eastern orchestral, oud, low male choir, war drums, brass, ominous ancient city, Phrygian mode, 92 bpm
- **Scripture (KJV, word for word):** Genesis 11:4; Genesis 11:9

```
[Verse 1]
In a single month it rose, red brick upon red brick
A tower on the plain where the smoke hangs thick
The gatekeeper is waiting with a key that will not turn
And the marshal in his crimson watches cities burn

[Pre-Chorus]
I hear the builders singing in a tongue I almost know

[Chorus]
Let us build us a city and a tower, whose top may reach unto heaven
Higher, higher, every stair
Let us build us a city and a tower, whose top may reach unto heaven
But heaven isn't there

[Verse 2]
Every floor a promise, every promise made of clay
Every name they carve in stone, the rain will wash away
I climb against the current of a thousand marching feet
To the crown of all their glory where the words and wonders meet

[Bridge]
(choir)
Therefore is the name of it called Babel

[Final Chorus]
Let us build us a city and a tower, whose top may reach unto heaven
Higher, higher, every stair
Let us build us a city and a tower, whose top may reach unto heaven
But heaven isn't there
```

### Red Brick, Red Sky (`ch2_tower`)

- **Chapter:** II
- **Kind:** instrumental
- **Style:** ancient Mesopotamian dark ambient, oud, duduk, low drones, hand percussion, tense climb, exploration loop, no vocals, 90 bpm

### The Valley of Bones (`ch3_bones`)

- **Chapter:** III
- **Kind:** vocal
- **Style:** haunting gothic choral, rattling bone percussion, desert wind, solo female vocal rising to a massive choir, awe and resurrection, 68 bpm
- **Scripture (KJV, word for word):** Ezekiel 37:4; Ezekiel 37:10

```
[Verse 1]
White as salt and dry as dust, the valley lies in rows
Every shield laid down to rust, and every name nobody knows
The wind goes through the ribcage of a kingdom long asleep
And the locusts sing a hunger that is older than the deep

[Chorus]
O ye dry bones, hear the word of the LORD
Hear it in the silence, hear it in the sword
O ye dry bones, hear the word of the LORD
Rise

[Verse 2]
I walk among the fallen and I do not walk alone
There's a rattle in the stillness, there's a breath in every bone
The king of all the swarming has his throne upon the hill
But the valley is remembering, and the valley isn't still

[Bridge]
(choir, building)
and they lived, and stood up upon their feet, an exceeding great army

[Final Chorus]
O ye dry bones, hear the word of the LORD
Hear it in the silence, hear it in the sword
O ye dry bones, hear the word of the LORD
Rise
```

### The Hive (`ch3_hive`)

- **Chapter:** III
- **Kind:** instrumental
- **Style:** dark ambient desert, insect drone textures, tribal percussion, eerie high strings, wind through bones, exploration loop, no vocals, 84 bpm

### The Plain of Dura (`ch4_dura`)

- **Chapter:** IV
- **Kind:** vocal
- **Style:** fiery epic orchestral, Middle Eastern percussion, brass fanfare, defiant male vocal trio, full choir, heat and courage, 100 bpm
- **Scripture (KJV, word for word):** Daniel 3:17; Daniel 3:25

```
[Verse 1]
The horns are blowing on the plain, the image burns like noon
The whole world bows its head as one when the music strikes the tune
The cornet and the harp and the dulcimer and drum
And the furnace mouth is open for the ones who will not come

[Pre-Chorus]
So heat it seven times, O king
We will not bow, we will not sing

[Chorus]
Our God whom we serve is able to deliver us from the burning fiery furnace
And if He will not, still we stand
Our God whom we serve is able to deliver us from the burning fiery furnace
The gold is only sand

[Verse 2]
The soldiers at the doorway fell before the flame
But in the white heat of the fire someone called our name
The ropes fell off like ashes and the smoke forgot our skin
And the king looked through the burning and he saw who walked within

[Bridge]
(choir)
Lo, I see four men loose, walking in the midst of the fire

[Final Chorus]
Our God whom we serve is able to deliver us from the burning fiery furnace
And if He will not, still we stand
Our God whom we serve is able to deliver us from the burning fiery furnace
The gold is only sand
```

### Seven Times Hotter (`ch4_furnace`)

- **Chapter:** IV
- **Kind:** instrumental
- **Style:** Babylonian ceremonial orchestral, horns, dulcimer, harp, low sackbut brass, war drums, shimmering heat, exploration loop, no vocals, 96 bpm

### The Writing on the Wall (`ch5_wall`)

- **Chapter:** V
- **Kind:** vocal
- **Style:** decadent dark orchestral waltz, harpsichord, muted brass, sultry female vocal, ominous Babylonian banquet, 3/4 time, 88 bpm
- **Scripture (KJV, word for word):** Daniel 5:25; Daniel 5:27

```
[Verse 1]
Pour the wine in golden cups they carried from the temple door
Raise them to the gods of brass and gods of stone, and pour some more
A thousand lords are laughing and the lamps are burning bright
While the river slips away beneath the city in the night

[Pre-Chorus]
Then the music stops
And a hand appears

[Chorus]
MENE, MENE, TEKEL, UPHARSIN
Written on the plaster by the candlestick
MENE, MENE, TEKEL, UPHARSIN
The night is falling quick

[Verse 2]
The king's knees knock together and his face has lost its gold
No wise man in the kingdom reads the words that must be told
So bring the old man in, the one they swore they'd never need
And let him read the writing that the empire couldn't read

[Bridge]
(whispered, then sung)
TEKEL; Thou art weighed in the balances, and art found wanting

[Final Chorus]
MENE, MENE, TEKEL, UPHARSIN
Written on the plaster by the candlestick
MENE, MENE, TEKEL, UPHARSIN
The night is falling quick
```

### The Hanging Gardens (`ch5_palace`)

- **Chapter:** V
- **Kind:** instrumental
- **Style:** eerie palace ambient, harp glissandi, low strings, music box, distant revelry, dread under luxury, exploration loop, no vocals, 80 bpm

### The Prince of Persia (`ch6_persia`)

- **Chapter:** VI
- **Kind:** vocal
- **Style:** epic Persian orchestral, santur, kamancheh, thunder drums, male lead vocal, choir, spiritual warfare in a storm, 96 bpm
- **Scripture (KJV, word for word):** Daniel 10:19; Ephesians 6:12

```
[Verse 1]
By the river Hiddekel I waited and I prayed
One and twenty days of mourning, and the answer was delayed
There's a prince above the kingdom with a shadow for a crown
And the storm is in his keeping and the rain is coming down

[Pre-Chorus]
For we wrestle not against flesh and blood

[Chorus]
O man greatly beloved, fear not
Peace be unto thee, be strong, yea, be strong
I cannot cast him down, but I can stand
Until the light comes on

[Verse 2]
In the palace of Shushan where the high places burn
Every lamp has gone to ashes and the princes wait their turn
I am only flesh and blood and I am trembling where I stand
But I will not yield the ground I hold, I will not lose this land

[Bridge]
(choir, thunder)
And then the light, the light of the great prince comes

[Final Chorus]
O man greatly beloved, fear not
Peace be unto thee, be strong, yea, be strong
I cannot cast him down, but I can stand
Until the light comes on
```

### Shushan the Palace (`ch6_shushan`)

- **Chapter:** VI
- **Kind:** instrumental
- **Style:** Persian dark ambient, santur, ney flute, low drones, rolling thunder, storm wind, exploration loop, no vocals, 86 bpm

### The Crown of the Hunt (`ch7_hunt`)

- **Chapter:** VII
- **Kind:** vocal
- **Style:** dark nordic folk, war horns, deep frame drums, chanting male vocals, throat singing, winter forest chase, D minor, 84 bpm
- **Scripture (KJV, word for word):** Psalm 23:4

```
[Verse 1]
The horn goes out across the snow and every village hears
Varkhos rides the northern wood and drives them on with spears
Antlers in the treeline and the stakes are in the ground
And every fire the hunter lights is one more trap he's found

[Chorus]
Yea, though I walk through the valley of the shadow of death
I will fear no evil: for thou art with me
Run if you must, but the hunted come home
The crown of the hunt cannot hunt me

[Verse 2]
I follow tracks of children through the frost and through the thorn
I cut the snares and break the stakes and answer horn with horn
The pack is at the river and the pack is on the hill
But the ones he called his quarry are the ones I'm carrying still

[Bridge]
(chant)
Home, home, bring them home

[Final Chorus]
Yea, though I walk through the valley of the shadow of death
I will fear no evil: for thou art with me
Run if you must, but the hunted come home
The crown of the hunt cannot hunt me
```

### The Winter Wood (`ch7_hunt_inst`)

- **Chapter:** VII
- **Kind:** instrumental
- **Style:** dark nordic ambient, distant war horns, taiko chase rhythm in threes, cold wind, galloping low strings, exploration loop, no vocals, 84 bpm

### The Crown of Pestilence (`ch8_plague`)

- **Chapter:** VIII
- **Kind:** vocal
- **Style:** dark gothic lament, droning cello, buzzing strings, sparse tolling bells, haunting female vocal, slow and sickly, C minor, 66 bpm
- **Scripture (KJV, word for word):** Psalm 91:5-6

```
[Verse 1]
The bog is breathing slowly and the reeds are full of wings
Morvane walks the marshes and the swarm is what she brings
The bile is in the water and the fever's in the bread
And the bells across the fen are ringing for the not-yet-dead

[Chorus]
Thou shalt not be afraid for the terror by night
Nor for the arrow that flieth by day
Nor for the pestilence that walketh in darkness
Nor for the destruction that wasteth at noonday

[Verse 2]
I carry out the sick ones on a stretcher made of oars
I burn the hives at sundown and I seal the cellar doors
The swarm can cloud the moonlight, it can blacken all the sky
But it cannot take the ones who are still singing, though they cry

[Bridge]
(lone voice)
Walketh in darkness, walketh in darkness
But I walk in the light

[Final Chorus]
Thou shalt not be afraid for the terror by night
Nor for the arrow that flieth by day
Nor for the pestilence that walketh in darkness
Nor for the destruction that wasteth at noonday
```

### The Fen (`ch8_plague_inst`)

- **Chapter:** VIII
- **Kind:** instrumental
- **Style:** dark ambient plague drone, sighing cello, insect buzz textures, distant bells, bog atmosphere, exploration loop, no vocals, 66 bpm

### The Crown of Cinders (`ch9_cinders`)

- **Chapter:** IX
- **Kind:** vocal
- **Style:** industrial orchestral, anvil and hammer percussion, choir, distorted low brass, gritty male vocal, forge fire, F Phrygian, 104 bpm
- **Scripture (KJV, word for word):** Isaiah 43:2

```
[Verse 1]
Hammer on the anvil, hammer on the chain
Azkar works the foundries and the slag comes down like rain
The bellows breathe like dragons and the furnaces are red
And every bar they're forging is a bar above a head

[Pre-Chorus]
Strike, strike, the iron calls
The fire climbs the foundry walls

[Chorus]
When thou walkest through the fire, thou shalt not be burned
Neither shall the flame kindle upon thee
Break the armor, break the chain
The cinders cannot keep me

[Verse 2]
The ground is cracking open where the molten rivers run
Three times the mountain answers and the sky forgets the sun
I parry every hammer and I step across the wave
And I carry out the workers from the forge into the day

[Final Chorus]
When thou walkest through the fire, thou shalt not be burned
Neither shall the flame kindle upon thee
Break the armor, break the chain
The cinders cannot keep me
```

### The Foundry (`ch9_cinders_inst`)

- **Chapter:** IX
- **Kind:** instrumental
- **Style:** industrial dark orchestral, ringing anvil strikes, bellows rhythm, low brass, choir pads, heat haze, exploration loop, no vocals, 100 bpm

### The Prince of Grecia (`ch10_grecia`)

- **Chapter:** X
- **Kind:** vocal
- **Style:** epic Greek-inspired orchestral, lyre, aulos, crashing waves, storm drums, male and female choir, heroic and stormy, 92 bpm
- **Scripture (KJV, word for word):** Daniel 10:20; Isaiah 43:2; Daniel 8:5

```
[Verse 1]
And when I am gone forth, lo, the prince of Grecia shall come
So the messenger had promised, and the promise wasn't done
Now the storm is on Chittim and the beacons have gone cold
And the temple lies beneath the sea with all its stolen gold

[Pre-Chorus]
An he goat came from the west on the face of the whole earth, and touched not the ground

[Chorus]
When thou passest through the waters, I will be with thee
And through the rivers, they shall not overflow thee
Dive down, dive deep, relight the flame
The sea will give them back again

[Verse 2]
In the library of drowned men there's a lamp that Hanan keeps
And a breath of air in a bell of stone, down where the scholar sleeps
The horns are on the cliffside and the great horn charges home
But I have learned to hold my breath, and I have learned to roam

[Bridge]
(choir, waves)
Four winds, four horns, one storm, one shore

[Final Chorus]
When thou passest through the waters, I will be with thee
And through the rivers, they shall not overflow thee
Dive down, dive deep, relight the flame
The sea will give them back again
```

### The Storm Coast (`ch10_grecia_inst`)

- **Chapter:** X
- **Kind:** instrumental
- **Style:** Greek storm ambient, lyre, aulos, ocean waves, rain, low strings, distant thunder, exploration loop, no vocals, 88 bpm
