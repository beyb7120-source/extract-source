import { YoutubeTranscript } from 'youtube-transcript';
import * as cheerio from 'cheerio';
import ytdl from 'ytdl-core';
import fs from 'fs';
import OpenAI from 'openai';

// حط الـ API Key ديالك هنا باش يخدم تحويل الصوت لنص
const openai = new OpenAI({ apiKey: 'YOUR_OPENAI_API_KEY' });

export default async ({ req, res, log, error }) => {
    if (req.method === 'GET') return res.send('Ultimate Extractor is running!');
    
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const url = body.url;

        if (!url) {
            return res.json({ success: false, error: 'URL manquante' }, 400);
        }

        // ==========================================
        // حالة يوتيوب (الترجمة أو الاستماع بالذكاء الاصطناعي)
        // ==========================================
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            try {
                // المحاولة 1: يقلب على الترجمة الواجدة (فابور وسريعة)
                log('Tentative de récupération du transcript standard...');
                const transcript = await YoutubeTranscript.fetchTranscript(url);
                const text = transcript.map(t => t.text).join(' ');
                return res.json({ success: true, text: text });
                
            } catch (e) {
                log('Transcript bloqué. Passage à l\'IA Whisper pour écouter la vidéo...');
                
                // المحاولة 2: تحميل الصوت وتحويله لكتابة بـ Whisper
                try {
                    const info = await ytdl.getInfo(url);
                    const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
                    
                    // مسار مؤقت فالسيرفر ديال Appwrite
                    const tempFilePath = `/tmp/audio_${Date.now()}.mp4`;

                    // تحميل الصوت
                    await new Promise((resolve, reject) => {
                        ytdl(url, { format: audioFormat })
                            .pipe(fs.createWriteStream(tempFilePath))
                            .on('finish', resolve)
                            .on('error', reject);
                    });

                    // صيفط الصوت لـ Whisper باش يكتبو
                    const transcription = await openai.audio.transcriptions.create({
                        file: fs.createReadStream(tempFilePath),
                        model: "whisper-1",
                    });

                    // مسح الملف الصوتي من السيرفر باش ماتعمرش الذاكرة
                    fs.unlinkSync(tempFilePath);

                    return res.json({ success: true, text: transcription.text });
                    
                } catch (whisperError) {
                    return res.json({ success: false, error: 'Impossible de transcrire la vidéo: ' + whisperError.message }, 500);
                }
            }
        } 
        // ==========================================
        // حالة المواقع العادية
        // ==========================================
        else {
            log('Extraction depuis un site web...');
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Le site a répondu avec l'erreur ${response.status}`);
            
            const html = await response.text();
            const $ = cheerio.load(html);
            const text = $('body').text().replace(/\s+/g, ' ').trim();
            
            return res.json({ success: true, text: text.substring(0, 50000) });
        }
    } catch (err) {
        error(err.message);
        return res.json({ success: false, error: err.message }, 500);
    }
};
