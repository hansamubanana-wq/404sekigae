# 司会者の素材

- 司会者の形、衣装、マイク、顔の表情、歩行と身振りは、このサイト用に three.js の形状とアニメーションで作成。モデルの実装は `mc-model.js`。
- 英語音声は Mirai が Google AI Studio の Gemini 3.8 Flash TTS（Mako）で作成した `take1.wav`。13.28秒の全編をAACに変換して使用。
- 合いの手も Mirai が同じ Google AI Studio の Gemini 3.8 Flash TTS（Mako）で作成。13.80秒の `mcreact/take1.wav` から7本に分け、前後の無音を詰めて `react/` にAACで収録。
- “MUSIC... START!!!” も Mirai が同じ声で作成した `mcmusic/take1.wav` の3本目を使用。前後の無音を詰め、`music-start.m4a` に収録。足音は `sound.js` で床の反射と余韻を含めて合成。
- “Thank you all, for coming here today!” は Mirai が同じ Gemini 3.8 Flash TTS（Mako）で作成した `mcthanks/take1.wav` の3本目を使用。前後の無音を詰め、`thanks.m4a` に収録。
- Noto Sans JP Black の日本語・英語字幕用サブセット。ライセンスは同梱の [OFL.txt](OFL.txt)。
