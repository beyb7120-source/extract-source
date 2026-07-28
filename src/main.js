import { YoutubeTranscript } from 'youtube-transcript';
import * as cheerio from 'cheerio';

export default async ({ req, res, log, error }) => {
    if (req.method === 'GET') return res.send('Extract Function is running!');
    
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const url = body.url;

        if (!url) {
            return res.json({ success: false, error: 'URL manquante' }, 400);
        }

        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            log('Extraction depuis YouTube...');
            const transcript = await YoutubeTranscript.fetchTranscript(url);
            const text = transcript.map(t => t.text).join(' ');
            return res.json({ success: true, text: text });
        } 
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
