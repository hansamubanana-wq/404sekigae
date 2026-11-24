# 司会者の素材

- 司会者のモデルと Idle は Kenney の [Animated Characters Protagonists](https://kenney.nl/assets/animated-characters-protagonists)（[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)）。比較用に作った蝶ネクタイの `kenney-host.png` を使用。
- Walk と合いの手に使う Victory の腕は Quaternius の [Ultimate Modular Men Pack](https://quaternius.com/packs/ultimatemodularcharacters.html)（CC0 1.0）から Kenney の骨格に移植。歩行の足裏を調整し、モデル・スキン・3つのアニメを `kenney-host.glb` に収録。マイクはサイト側で追加。
- 旧モデルとその歩行・表情の実装は `mc-model.js` に収録。
- 英語音声は Mirai が Google AI Studio の Gemini 3.8 Flash TTS（Mako）で作成した `take1.wav`。13.28秒の全編をAACに変換して使用。
- 合いの手も Mirai が同じ Google AI Studio の Gemini 3.8 Flash TTS（Mako）で作成。13.80秒の `mcreact/take1.wav` から7本に分け、前後の無音を詰めて `react/` にAACで収録。
- “MUSIC... START!!!” も Mirai が同じ声で作成した `mcmusic/take1.wav` の3本目を使用。前後の無音を詰め、`music-start.m4a` に収録。
- 革靴の足音は Rvgerxini の録音 [Walking on hard surface](https://freesound.org/people/Rvgerxini/sounds/462179/)（[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)）。14.154秒、14.624秒、15.140秒、15.650秒から1歩ずつ切り出し、低域・音量・末尾を調整して `steps/` にモノラルのAACで収録。
- “Thank you all, for coming here today!” は Mirai が同じ Gemini 3.8 Flash TTS（Mako）で作成した `mcthanks/take1.wav` の3本目を使用。前後の無音を詰め、`thanks.m4a` に収録。
- Noto Sans JP Black の日本語・英語字幕用サブセット。ライセンスは同梱の [OFL.txt](OFL.txt)。
