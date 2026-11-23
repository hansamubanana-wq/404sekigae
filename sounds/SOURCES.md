# 効果音の出典と切り出し位置

素材名は Sonniss GDC 2026 Game Audio Bundle 内の WAV ファイル名です。切り出し位置は元音源の先頭からの秒数です。
新規素材は 44.1 kHz、128 または 160 kbps の MP3 に変換し、元のステレオを維持しました。拍手のサラウンド素材はステレオに変換しています。
既存音との音量差を抑えるため、目安の -16 LUFS を基準に、場面と鳴る頻度に応じて音量を調整しました。新規 MP3 のトゥルーピークは -1.5 dBTP 以下です。
末尾には短いフェードを入れています。ループ再生する `dice` と `ufo` は末尾と先頭をクロスフェードしています。

| 名前 | MP3 | 元の素材ファイル名 | 切り出し位置（秒） |
| --- | --- | --- | --- |
| `click` | `click.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `toggle` | `toggle.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `save` | `save.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `flip` | `flip1.mp3` | PAPRHndl_Game Play Cards Dry Show Flip Toss Disgard Near 12_ESM_BG.wav | 0.000–0.167 |
| `flip` | `flip2.mp3` | Foley Coin Flip Single Fast.wav | 0.006–0.496 |
| `land` | `land1.mp3` | OBJLug_CaseDown_Concrete12_InMotionAudio_InstrumentCase.wav | 0.014–0.384 |
| `land` | `land2.mp3` | WOODImpt_Wooden Hit, Dark, Heavy Hit, Vampire's Prison_344 Audio_Haunting Ambiences Vol 3.wav | 2.257–2.737 |
| `land` | `land3.mp3` | FGHTImpt_Combat Punch Impact Light Hit Delay Crunchy Vintage Quick Smack 05_ESM_AG.wav | 0.022–0.502 |
| `chime` | `chime1.mp3` | MAGAngl_Magic Light Spell Enchantment Potion Effect Tonal Bright 03_ESM_FG2.wav | 0.438–1.278 |
| `chime` | `chime2.mp3` | Ting Coins.wav | 0.078–0.608 |
| `whoosh` | `whoosh1.mp3` | Woosh Sweep Slide Infographics Basic.wav | 0.032–0.322 |
| `whoosh` | `whoosh2.mp3` | Cartoon Pull Swoosh Readout.wav | 0.851–1.471 |
| `whoosh` | `whoosh3.mp3` | DSGNStngr_Action Deploy Units Sword Slice Special Move Layered Swish 04_ESM_TDG.wav | 0.177–0.797 |
| `magic` | `magic1.mp3` | GAMEMisc_Magic Creation 23_CB Sounddesign_APPlicable Sounds.wav | 0.226–1.906 |
| `magic` | `magic2.mp3` | magic, energy flow, astonishment-001.wav | 1.229–2.689 |
| `magic` | `magic3.mp3` | magic, energy flow, astral travel-015.wav | 0.619–2.239 |
| `bell` | `bell.mp3` | MAGMisc_Magic Christmas Bells 2_344 Audio_Christmas.wav | 2.187–3.567 |
| `gong` | `gong.mp3` | Impact Hit Rapid Chord Reverb.wav | 0.243–2.403 |
| `pop` | `pop1.mp3` | Cartoon Bubbles Short.wav | 0.006–0.456 |
| `pop` | `pop2.mp3` | WATRMisc_Water, Liquid Impact, Bubble, Sci Fi, Hit 04_344 Audio_Elemental Palette Designed Vol 1.wav | 0.127–0.577 |
| `pop` | `pop3.mp3` | Cartoon Pops Random Sequence Reverb.wav | 0.000–0.450 |
| `boing` | `boing1.mp3` | Accept Boing Crunch.wav | 0.012–0.642 |
| `boing` | `boing2.mp3` | ANMLAmph_Animal Frog Echo Short Squished Frequency Formant 03_ESM_SNLS.wav | 0.004–0.404 |
| `tick` | `tick.mp3` | CLOCKTick_Crooked Antique Clock_344 Audio_Antique Clocks.wav | 0.995–1.145 |
| `stop` | `stop1.mp3` | MECHLtch_Click Deep Mechanism Latch Button Nearfield Thunk 02_ESM_HDLM.wav | 0.000–0.270 |
| `stop` | `stop2.mp3` | Interface Accept Glassy Snap.wav | 0.004–0.314 |
| `wrong` | `wrong1.mp3` | Interface Deny Low Fat Dark.wav | 0.000–0.610 |
| `wrong` | `wrong2.mp3` | Cartoon Transition Bass Down.wav | 0.365–1.145 |
| `question` | `question.mp3` | Cartoon Confused Dizzy.wav | 0.005–0.815 |
| `glitch` | `glitch1.mp3` | UIGlitch_Designed_Glitch_Corrupted_Data Error_The Noisery_Rich Glitch_06.wav | 0.012–0.332 |
| `glitch` | `glitch2.mp3` | UIGlitch_User interface_Glitch_High_Electronic_The Noisery_Rich Glitch_05.wav | 0.000–0.330 |
| `glitch` | `glitch3.mp3` | ELECMisc_Impact Electric Tonal Deep Movement Motion Hiss Glitch 01_ESM_EMWI.wav | 0.022–0.342 |
| `dice` | `dice1.mp3` | GAMEBoard_Event Board Reset Organic Multiple Pieces Wood Small 02_ESM_BG.wav | 0.048–0.878 |
| `dice` | `dice2.mp3` | GAMECas_Automatic Shuffler, Shuffling 1_344 Audio_Casino Cards Vol 1.wav | 0.350–2.700 |
| `crack` | `crack1.mp3` | ice, crack, ice block snapping-001.wav | 0.517–1.137 |
| `crack` | `crack2.mp3` | ice, surface cracking, fissure, fast, hard-003.wav | 0.307–0.927 |
| `shatter` | `shatter1.mp3` | ICEBrk_Skill Freeze Whoosh Break Impact Layered Movement Shatter 03_ESM_TDG.wav | 0.069–1.419 |
| `shatter` | `shatter2.mp3` | GLASMvmt_Whoosh Glass Crystal Fragments Sharp Shards Dry 05_ESM_EMWI.wav | 0.666–2.226 |
| `boom` | `boom1.mp3` | EffectiveTrailer_Booms_Vol2_011.wav | 0.252–2.832 |
| `boom` | `boom2.mp3` | EffectiveTrailer_Booms_Vol2_075.wav | 0.245–2.825 |
| `boom` | `boom3.mp3` | EffectiveTrailer_Booms_Vol2_214.wav | 0.251–2.831 |
| `crunch` | `crunch1.mp3` | ice, block of ice crushed, heavy-015.wav | 0.234–1.014 |
| `crunch` | `crunch2.mp3` | EXPLDsgn_Explosion Small Blast Enemy Death Crunchy Boom Cartoon Noisy Crash Impact Delay 03_ESM_AG.wav | 0.012–0.902 |
| `slam` | `slam1.mp3` | OBJLug_Case_Closed06_InMotionAudio_InstrumentCase.wav | 0.004–0.354 |
| `slam` | `slam2.mp3` | DOORMetl_StairWellDoor01_InMotionAudio_USAHotel.wav | 5.072–5.722 |
| `metal` | `metal1.mp3` | DSGNImpt_Metal Hit Thud Thump Low Ring Geofon 1_The Noisery_Moaning Metal.wav | 0.006–1.156 |
| `metal` | `metal2.mp3` | METLImpt_METAL SWING HIT Weapon Swing To Metallic Body Impact And Resonant Tail 01_DDUMAIS_MWP2.wav | 0.067–1.247 |
| `thruster` | `thruster1.mp3` | AEROJet_Blast Off Clean_344 Audio_Air Designed.wav | 5.850–7.740 |
| `thruster` | `thruster2.mp3` | FIREWhsh_Whoosh Fire Deep Growl Monster Saturated Crisp 03_ESM_EMWI.wav | 0.158–1.678 |
| `ufo` | `ufo.mp3` | DSGNSynth_Scifi Loop Ship Reactor Synth Layer Layered Saw Buzz_ESM_SGA3.wav | 4.100–7.000 |
| `beam` | `beam1.mp3` | ELECArc_ArcDesign15_InMotionAudio_Arc.wav | 0.000–1.030 |
| `beam` | `beam2.mp3` | magic, action gesture, evil presence, onslaught-004.wav | 1.606–2.976 |
| `laser` | `laser1.mp3` | UIAlert_Collect Scifi Futuristic Electronic Bass Burst Sweep Heavy 04_ESM_FG2.wav | 0.000–0.280 |
| `laser` | `laser2.mp3` | Interface Sci-Fi Ping Down.wav | 0.000–0.590 |
| `powerup` | `powerup1.mp3` | DSGNStngr_Power Up Bright Positive Successful Light Saturation Crash Shimmer 05_ESM_AG.wav | 0.048–1.328 |
| `powerup` | `powerup2.mp3` | ELECArc_ArcPowerUpDesign04_InMotionAudio_Arc.wav | 4.250–6.050 |
| `phase` | `phase1.mp3` | Vibrato Impact Snap Spin Transition.wav | 0.875–2.005 |
| `phase` | `phase2.mp3` | GAMEMisc_Magic Creation 23_CB Sounddesign_APPlicable Sounds.wav | 0.497–1.447 |
| `zap` | `zap.mp3` | COMStatic_Radio Ham Loop Static Hum Active Powered On Garbled Noise 01_ESM_FA.wav | 10.980–11.640 |
| `suspense` | `suspense1.mp3` | magic, drone, tension, spellbound, evanescence-002.wav | 0.626–3.446 |
| `suspense` | `suspense2.mp3` | Transition Braam Slow Dark Creepy.wav | 0.355–3.175 |
| `suspense` | `suspense3.mp3` | DSGNBram____Cinematic Horn Braam, Epic, Cinematic, Dark, Instrument, Huge-67.wav | 0.118–2.938 |
| `down` | `down1.mp3` | DSGNBass_Bass Drop & Downer Fast 16_344 Audio_Bass Drops & Downers.wav | 0.145–1.805 |
| `down` | `down2.mp3` | DSGNBass_Bass Drop & Downer Fast 12_344 Audio_Bass Drops & Downers Vol 2.wav | 0.000–1.660 |
| `down` | `down3.mp3` | DSGNBass_Rattling Downer 3_344 Audio_Bass Drops and Downers Vol 3.wav | 0.107–1.717 |
| `switch` | `switch1.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `switch` | `switch2.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `heart` | `heart.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `wood` | `wood1.mp3` | WEAPBlnt_Spear And Stick Impact, Wooden MKH 2_344 Audio_Medieval Weapons Vol 2.wav | 0.038–0.328 |
| `wood` | `wood2.mp3` | WOODImpt_Hit Blood Spill Splat Wood Impact Light Hit Squelch Small Thump 03_ESM_TDG.wav | 0.000–0.320 |
| `boxopen` | `boxopen1.mp3` | OBJLug_Suitcase Opening and Closing, Antique Suitcase_344 Audio_Antiques - Luggage_01.wav | 1.460–2.040 |
| `boxopen` | `boxopen2.mp3` | METLMvmt_  Opening Lid Of Antique Blowtorch_344 Audio_Antique Small Metals.wav | 0.154–0.914 |
| `cloth` | `cloth1.mp3` | CLOTHFlp_Action Inventory Open Flip Cloth Canvas Bag Slide Light 02_ESM_FG2.wav | 0.058–0.558 |
| `cloth` | `cloth2.mp3` | FOLYClth_ClothMovement24_InMotionAudio_FoleyT-Shirt.wav | 0.447–0.977 |
| `cloth` | `cloth3.mp3` | FOLYClth_ClothMovement29_InMotionAudio_FoleyT-Shirt.wav | 0.071–0.501 |
| `step` | `step1.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `step` | `step2.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `step` | `step3.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `firework` | `firework1.mp3` | 02 Fireworks_ explosions_dense_whistles.wav | 3.980–5.300 |
| `firework` | `firework2.mp3` | 13 Fireworks_powerful explosions_multiples in a row_near.wav | 2.480–3.910 |
| `firework` | `firework3.mp3` | SBfa_Fireworks 001.wav | 1.740–3.020 |
| `bang` | `bang1.mp3` | OBJMisc_CrackerPull_WithBang_Effected_03_InMotionAudio_ChristmasCracker.wav | 0.067–0.467 |
| `bang` | `bang2.mp3` | WEAPWhip_WHIP Snap Crack 05_DDUMAIS_MWP2.wav | 0.147–0.797 |
| `windbig` | `windbig1.mp3` | WINDDsgn_Wind, Rush, Whoosh, Long x5 01_344 Audio_Elemental Palette Designed Vol 1.wav | 0.047–1.047 |
| `windbig` | `windbig2.mp3` | WINDTonl_Wind Strong Gusts Hurricane Vents Rattle 06_The Noisery_City Rain.wav | 26.800–28.550 |
| `applause` | `applause.mp3` | CRWDCheer_Small Club, 50 People, Crowd, Spanish, Cheering and Applause-Surround_KSL_KS015.wav | 0.140–5.840 |
| `fanfare` | `fanfare.mp3` | 既存の `fanfare.mp3`（末尾のみ調整） | 0.000–5.940 |
| `win` | `win.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `jingle_start` | `jingle_start.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `jingle_mode` | `jingle_mode.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `jingle_speed` | `jingle_speed.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `jingle_half` | `jingle_half.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `jingle_last` | `jingle_last.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
| `jingle_reveal` | `jingle_reveal.mp3` | 既存音源（`CREDITS.txt` 参照） | — |
